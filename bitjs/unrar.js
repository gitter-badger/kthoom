/**
 * unrar.js
 *
 * Copyright(c) 2011 Google Inc.
 * Copyright(c) 2011 antimatter15
 *
 * Reference Documentation:
 *
 * http://kthoom.googlecode.com/hg/docs/unrar.html
 */

// This file expects to be invoked as a Worker (see onmessage below).
importScripts('io/bitstream.js');
importScripts('io/bytebuffer.js');
importScripts('archive.js');

// Progress variables.
var currentFilename = "";
var currentFileNumber = 0;
var currentBytesUnarchivedInFile = 0;
var currentBytesUnarchived = 0;
var totalUncompressedBytesInArchive = 0;
var totalFilesInArchive = 0;

// Helper functions.
var info = function(str) {
  postMessage(new bitjs.archive.UnarchiveInfoEvent(str));
};
var err = function(str) {
  postMessage(new bitjs.archive.UnarchiveErrorEvent(str));
};
var postProgress = function() {
  postMessage(new bitjs.archive.UnarchiveProgressEvent(
      currentFilename,
      currentFileNumber,
      currentBytesUnarchivedInFile,
      currentBytesUnarchived,
      totalUncompressedBytesInArchive,
      totalFilesInArchive));
};

// shows a byte value as its hex representation
var nibble = "0123456789ABCDEF";
var byteValueToHexString = function(num) {
  return nibble[num>>4] + nibble[num&0xF];
};
var twoByteValueToHexString = function(num) {
  return nibble[(num>>12)&0xF] + nibble[(num>>8)&0xF] + nibble[(num>>4)&0xF] + nibble[num&0xF];
};


// Volume Types
var MARK_HEAD      = 0x72,
  MAIN_HEAD      = 0x73,
  FILE_HEAD      = 0x74,
  COMM_HEAD      = 0x75,
  AV_HEAD        = 0x76,
  SUB_HEAD      = 0x77,
  PROTECT_HEAD    = 0x78,
  SIGN_HEAD      = 0x79,
  NEWSUB_HEAD      = 0x7a,
  ENDARC_HEAD      = 0x7b;

// ============================================================================================== //

/**
 * CRC Implementation.
 */
var CRCTab = new Array(256).fill(0);

function InitCRC() {
  for (var i = 0; i < 256; ++i) {
    var c = i;
    for (var j = 0; j < 8; ++j) {
      // Read http://stackoverflow.com/questions/6798111/bitwise-operations-on-32-bit-unsigned-ints
      // for the bitwise operator issue (JS interprets operands as 32-bit signed
      // integers and we need to deal with unsigned ones here).
      c = ((c & 1) ? ((c >>> 1) ^ 0xEDB88320) : (c >>> 1)) >>> 0;
    }
    CRCTab[i] = c;
  }
}

/**
 * @param {number} startCRC
 * @param {Uint8Array} arr
 * @return {number}
 */
function CRC(startCRC, arr) {
  if (CRCTab[1] == 0) {
    InitCRC();
  }

/*
#if defined(LITTLE_ENDIAN) && defined(PRESENT_INT32) && defined(ALLOW_NOT_ALIGNED_INT)
  while (Size>0 && ((long)Data & 7))
  {
    StartCRC=CRCTab[(byte)(StartCRC^Data[0])]^(StartCRC>>8);
    Size--;
    Data++;
  }
  while (Size>=8)
  {
    StartCRC^=*(uint32 *)Data;
    StartCRC=CRCTab[(byte)StartCRC]^(StartCRC>>8);
    StartCRC=CRCTab[(byte)StartCRC]^(StartCRC>>8);
    StartCRC=CRCTab[(byte)StartCRC]^(StartCRC>>8);
    StartCRC=CRCTab[(byte)StartCRC]^(StartCRC>>8);
    StartCRC^=*(uint32 *)(Data+4);
    StartCRC=CRCTab[(byte)StartCRC]^(StartCRC>>8);
    StartCRC=CRCTab[(byte)StartCRC]^(StartCRC>>8);
    StartCRC=CRCTab[(byte)StartCRC]^(StartCRC>>8);
    StartCRC=CRCTab[(byte)StartCRC]^(StartCRC>>8);
    Data+=8;
    Size-=8;
  }
#endif
*/

  for (var i = 0; i < arr.length; ++i) {
    var byte = ((startCRC ^ arr[i]) >>> 0) & 0xff;
    startCRC = (CRCTab[byte] ^ (startCRC >>> 8)) >>> 0;
  }

  return startCRC;
}

/**
 * RarVM Implementation.
 */
var VM_MEMSIZE = 0x40000;
var VM_MEMMASK = (VM_MEMSIZE - 1);
var VM_GLOBALMEMADDR = 0x3C000;
var VM_GLOBALMEMSIZE = 0x2000;
var VM_FIXEDGLOBALSIZE = 64;
var MAXWINSIZE = 0x400000;
var MAXWINMASK = (MAXWINSIZE - 1);

/**
 */
var VM_Commands = {
  VM_MOV: 0,
  VM_CMP: 1,
  VM_ADD: 2,
  VM_SUB: 3,
  VM_JZ: 4,
  VM_JNZ: 5,
  VM_INC: 6,
  VM_DEC: 7,
  VM_JMP: 8,
  VM_XOR: 9,
  VM_AND: 10,
  VM_OR: 11,
  VM_TEST: 12,
  VM_JS: 13,
  VM_JNS: 14,
  VM_JB: 15,
  VM_JBE: 16,
  VM_JA: 17,
  VM_JAE: 18,
  VM_PUSH: 19,
  VM_POP: 20,
  VM_CALL: 21,
  VM_RET: 22,
  VM_NOT: 23,
  VM_SHL: 24,
  VM_SHR: 25,
  VM_SAR: 26,
  VM_NEG: 27,
  VM_PUSHA: 28,
  VM_POPA: 29,
  VM_PUSHF: 30,
  VM_POPF: 31,
  VM_MOVZX: 32,
  VM_MOVSX: 33,
  VM_XCHG: 34,
  VM_MUL: 35,
  VM_DIV: 36,
  VM_ADC: 37,
  VM_SBB: 38,
  VM_PRINT: 39,

/*
#ifdef VM_OPTIMIZE
  VM_MOVB, VM_MOVD, VM_CMPB, VM_CMPD,

  VM_ADDB, VM_ADDD, VM_SUBB, VM_SUBD, VM_INCB, VM_INCD, VM_DECB, VM_DECD,
  VM_NEGB, VM_NEGD,
#endif
*/

  // TODO: This enum value would be much larger if VM_OPTIMIZE.
  VM_STANDARD: 40,
};

/**
 */
var VM_StandardFilters = {
  VMSF_NONE: 0,
  VMSF_E8: 1,
  VMSF_E8E9: 2,
  VMSF_ITANIUM: 3,
  VMSF_RGB: 4,
  VMSF_AUDIO: 5,
  VMSF_DELTA: 6,
  VMSF_UPCASE: 7,
};

/**
 */
var VM_Flags = {
  VM_FC: 1,
  VM_FZ: 2,
  VM_FS: 0x80000000,
};

/**
 */
var VM_OpType = {
  VM_OPREG: 0,
  VM_OPINT: 1,
  VM_OPREGMEM: 2,
  VM_OPNONE: 3,
};

/**
 * Finds the key that maps to a given value in an object.
 * @param {Object} obj
 * @param {number} val
 * @return {string} The key/enum value as a string.
 */
function findKeyForValue(obj, val) {
  for (var key in obj) {
    if (obj[key] === val) {
      return key;
    }
  }
  return null;
}

function getDebugString(obj, val) {
  var s = 'Unknown.';
  if (obj === VM_Commands) {
    s = 'VM_Commands.';
  } else if (obj === VM_StandardFilters) {
    s = 'VM_StandardFilters.';
  } else if (obj === VM_Flags) {
    s = 'VM_OpType.';
  } else if (obj === VM_OpType) {
    s = 'VM_OpType.';
  }

  return s + findKeyForValue(obj, val);
}

/**
 * @struct
 * @constructor
 */
var VM_PreparedOperand = function() {
  /** @type {VM_OpType} */
  this.Type;

  /** @type {number} */
  this.Data = 0;

  /** @type {number} */
  this.Base = 0;

  // TODO: In C++ this is a uint*
  /** @type {Array<number>} */
  this.Addr = null;
};

/** @return {string} */
VM_PreparedOperand.prototype.toString = function() {
  if (this.Type === null) {
    return 'Error: Type was null in VM_PreparedOperand';
  }
  return '{ '
      + 'Type: ' + getDebugString(VM_OpType, this.Type)
      + ', Data: ' + this.Data
      + ', Base: ' + this.Base
      + ' }';
};

/**
 * @struct
 * @constructor
 */
var VM_PreparedCommand = function() {
  /** @type {VM_Commands} */
  this.OpCode;

  /** @type {boolean} */
  this.ByteMode = false;

  /** @type {VM_PreparedOperand} */
  this.Op1 = new VM_PreparedOperand();

  /** @type {VM_PreparedOperand} */
  this.Op2 = new VM_PreparedOperand();
};

/** @return {string} */
VM_PreparedCommand.prototype.toString = function(indent) {
  if (this.OpCode === null) {
    return 'Error: OpCode was null in VM_PreparedCommand';
  }
  indent = indent || '';
  return indent + '{\n'
      + indent + '  OpCode: ' + getDebugString(VM_Commands, this.OpCode) + ',\n'
      + indent + '  ByteMode: ' + this.ByteMode + ',\n'
      + indent + '  Op1: ' + this.Op1.toString() + ',\n'
      + indent + '  Op2: ' + this.Op2.toString() + ',\n'
      + indent + '}';
};

/**
 * @struct
 * @constructor
 */
var VM_PreparedProgram = function() {
  /** @type {Array<VM_PreparedCommand>} */
  this.Cmd = [];

  /** @type {VM_PreparedCommand} */
  this.AltCmd = null;

  /** @type {number} */
  // TODO: Should this just be the length property on the Cmd list?
  //this.CmdCount = 0;

  /** @type {Uint8Array} */
  this.GlobalData = new Uint8Array();

  /** @type {Uint8Array} */
  this.StaticData = new Uint8Array(); // static data contained in DB operators

  /** @type {new Uint8Array()} */
  this.InitR = new Uint8Array(7);

  /**
   * A pointer to bytes
   * @type {Uint8Array}
   */
  this.FilteredData = null;

  /** @type {number} */
  this.FilteredDataSize = 0;
};

/** @return {string} */
VM_PreparedProgram.prototype.toString = function() {
  var s = '{\n  Cmd: [\n';
  for (var i = 0; i < this.Cmd.length; ++i) {
    s += this.Cmd[i].toString('  ') + ',\n';
  }
  s += '],\n';
  // TODO: Dump GlobalData, StaticData, InitR?
  s += ' }\n';
  return s;
};

/**
 * @struct
 * @constructor
 */
var UnpackFilter = function() {
  /** @type {number} */
  this.BlockStart = 0;

  /** @type {number} */
  this.BlockLength = 0;

  /** @type {number} */
  this.ExecCount = 0;

  /** @type {boolean} */
  this.NextWindow = false;

  // position of parent filter in Filters array used as prototype for filter
  // in PrgStack array. Not defined for filters in Filters array.
  /** @type {number} */
  this.ParentFilter = null;

  /** @type {VM_PreparedProgram} */
  this.Prg = new VM_PreparedProgram();
};

var VMCF_OP0       =  0;
var VMCF_OP1       =  1;
var VMCF_OP2       =  2;
var VMCF_OPMASK    =  3;
var VMCF_BYTEMODE  =  4;
var VMCF_JUMP      =  8;
var VMCF_PROC      = 16;
var VMCF_USEFLAGS  = 32;
var VMCF_CHFLAGS   = 64;

var VM_CmdFlags = [
  /* VM_MOV   */ VMCF_OP2 | VMCF_BYTEMODE                                ,
  /* VM_CMP   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_ADD   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_SUB   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_JZ    */ VMCF_OP1 | VMCF_JUMP | VMCF_USEFLAGS                    ,
  /* VM_JNZ   */ VMCF_OP1 | VMCF_JUMP | VMCF_USEFLAGS                    ,
  /* VM_INC   */ VMCF_OP1 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_DEC   */ VMCF_OP1 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_JMP   */ VMCF_OP1 | VMCF_JUMP                                    ,
  /* VM_XOR   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_AND   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_OR    */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_TEST  */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_JS    */ VMCF_OP1 | VMCF_JUMP | VMCF_USEFLAGS                    ,
  /* VM_JNS   */ VMCF_OP1 | VMCF_JUMP | VMCF_USEFLAGS                    ,
  /* VM_JB    */ VMCF_OP1 | VMCF_JUMP | VMCF_USEFLAGS                    ,
  /* VM_JBE   */ VMCF_OP1 | VMCF_JUMP | VMCF_USEFLAGS                    ,
  /* VM_JA    */ VMCF_OP1 | VMCF_JUMP | VMCF_USEFLAGS                    ,
  /* VM_JAE   */ VMCF_OP1 | VMCF_JUMP | VMCF_USEFLAGS                    ,
  /* VM_PUSH  */ VMCF_OP1                                                ,
  /* VM_POP   */ VMCF_OP1                                                ,
  /* VM_CALL  */ VMCF_OP1 | VMCF_PROC                                    ,
  /* VM_RET   */ VMCF_OP0 | VMCF_PROC                                    ,
  /* VM_NOT   */ VMCF_OP1 | VMCF_BYTEMODE                                ,
  /* VM_SHL   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_SHR   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_SAR   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_NEG   */ VMCF_OP1 | VMCF_BYTEMODE | VMCF_CHFLAGS                 ,
  /* VM_PUSHA */ VMCF_OP0                                                ,
  /* VM_POPA  */ VMCF_OP0                                                ,
  /* VM_PUSHF */ VMCF_OP0 | VMCF_USEFLAGS                                ,
  /* VM_POPF  */ VMCF_OP0 | VMCF_CHFLAGS                                 ,
  /* VM_MOVZX */ VMCF_OP2                                                ,
  /* VM_MOVSX */ VMCF_OP2                                                ,
  /* VM_XCHG  */ VMCF_OP2 | VMCF_BYTEMODE                                ,
  /* VM_MUL   */ VMCF_OP2 | VMCF_BYTEMODE                                ,
  /* VM_DIV   */ VMCF_OP2 | VMCF_BYTEMODE                                ,
  /* VM_ADC   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_USEFLAGS | VMCF_CHFLAGS ,
  /* VM_SBB   */ VMCF_OP2 | VMCF_BYTEMODE | VMCF_USEFLAGS | VMCF_CHFLAGS ,
  /* VM_PRINT */ VMCF_OP0                                                ,
];


/**
 * @param {number} length
 * @param {number} crc
 * @param {VM_StandardFilters} type
 * @struct
 * @constructor
 */
var StandardFilterSignature = function(length, crc, type) {
  /** @type {number} */
  this.Length = length;

  /** @type {number} */
  this.CRC = crc;

  /** @type {VM_StandardFilters} */
  this.Type = type;
};

/**
 * @type {Array<StandardFilterSignature>}
 */
var StdList = [
  new StandardFilterSignature(53, 0xad576887, VM_StandardFilters.VMSF_E8),
  new StandardFilterSignature(57, 0x3cd7e57e, VM_StandardFilters.VMSF_E8E9),
  new StandardFilterSignature(120, 0x3769893f, VM_StandardFilters.VMSF_ITANIUM),
  new StandardFilterSignature(29, 0x0e06077d, VM_StandardFilters.VMSF_DELTA),
  new StandardFilterSignature(149, 0x1c2c5dc8, VM_StandardFilters.VMSF_RGB),
  new StandardFilterSignature(216, 0xbc85e701, VM_StandardFilters.VMSF_AUDIO),
  new StandardFilterSignature(40, 0x46b9c560, VM_StandardFilters.VMSF_UPCASE),
];

// ============================================================================================== //

// bstream is a bit stream
var RarVolumeHeader = function(bstream) {

  var headPos = bstream.bytePtr;
  // byte 1,2
  info("Rar Volume Header @"+bstream.bytePtr);
  
  this.crc = bstream.readBits(16);
  info("  crc=" + this.crc);

  // byte 3
  this.headType = bstream.readBits(8);
  info("  headType=" + this.headType);

  // Get flags
  // bytes 4,5
  this.flags = {};
  this.flags.value = bstream.peekBits(16);
  
  info("  flags=" + twoByteValueToHexString(this.flags.value));
  switch (this.headType) {
  case MAIN_HEAD:
    this.flags.MHD_VOLUME = !!bstream.readBits(1);
    this.flags.MHD_COMMENT = !!bstream.readBits(1);
    this.flags.MHD_LOCK = !!bstream.readBits(1);
    this.flags.MHD_SOLID = !!bstream.readBits(1);
    this.flags.MHD_PACK_COMMENT = !!bstream.readBits(1);
    this.flags.MHD_NEWNUMBERING = this.flags.MHD_PACK_COMMENT;
    this.flags.MHD_AV = !!bstream.readBits(1);
    this.flags.MHD_PROTECT = !!bstream.readBits(1);
    this.flags.MHD_PASSWORD = !!bstream.readBits(1);
    this.flags.MHD_FIRSTVOLUME = !!bstream.readBits(1);
    this.flags.MHD_ENCRYPTVER = !!bstream.readBits(1);
    bstream.readBits(6); // unused
    break;
  case FILE_HEAD:
    this.flags.LHD_SPLIT_BEFORE = !!bstream.readBits(1); // 0x0001
    this.flags.LHD_SPLIT_AFTER = !!bstream.readBits(1); // 0x0002
    this.flags.LHD_PASSWORD = !!bstream.readBits(1); // 0x0004
    this.flags.LHD_COMMENT = !!bstream.readBits(1); // 0x0008
    this.flags.LHD_SOLID = !!bstream.readBits(1); // 0x0010
    bstream.readBits(3); // unused
    this.flags.LHD_LARGE = !!bstream.readBits(1); // 0x0100
    this.flags.LHD_UNICODE = !!bstream.readBits(1); // 0x0200
    this.flags.LHD_SALT = !!bstream.readBits(1); // 0x0400
    this.flags.LHD_VERSION = !!bstream.readBits(1); // 0x0800
    this.flags.LHD_EXTTIME = !!bstream.readBits(1); // 0x1000
    this.flags.LHD_EXTFLAGS = !!bstream.readBits(1); // 0x2000
    bstream.readBits(2); // unused
    info("  LHD_SPLIT_BEFORE = " + this.flags.LHD_SPLIT_BEFORE);
    break;
  default:
    bstream.readBits(16);
  }
  
  // byte 6,7
  this.headSize = bstream.readBits(16);
  info("  headSize=" + this.headSize);
  switch (this.headType) {
  case MAIN_HEAD:
    this.highPosAv = bstream.readBits(16);
    this.posAv = bstream.readBits(32);
    if (this.flags.MHD_ENCRYPTVER) {
      this.encryptVer = bstream.readBits(8);
    }
    info("Found MAIN_HEAD with highPosAv=" + this.highPosAv + ", posAv=" + this.posAv);
    break;
  case FILE_HEAD:
    this.packSize = bstream.readBits(32);
    this.unpackedSize = bstream.readBits(32);
    this.hostOS = bstream.readBits(8);
    this.fileCRC = bstream.readBits(32);
    this.fileTime = bstream.readBits(32);
    this.unpVer = bstream.readBits(8);
    this.method = bstream.readBits(8);
    this.nameSize = bstream.readBits(16);
    this.fileAttr = bstream.readBits(32);
    
    if (this.flags.LHD_LARGE) {
      info("Warning: Reading in LHD_LARGE 64-bit size values");
      this.HighPackSize = bstream.readBits(32);
      this.HighUnpSize = bstream.readBits(32);
    } else {
      this.HighPackSize = 0;
      this.HighUnpSize = 0;
      if (this.unpackedSize == 0xffffffff) {
        this.HighUnpSize = 0x7fffffff
        this.unpackedSize = 0xffffffff;
      }
    }
    this.fullPackSize = 0;
    this.fullUnpackSize = 0;
    this.fullPackSize |= this.HighPackSize;
    this.fullPackSize <<= 32;
    this.fullPackSize |= this.packSize;
    
    // read in filename
    
    this.filename = bstream.readBytes(this.nameSize);
    for (var _i = 0, _s = ''; _i < this.filename.length; _i++) {
      _s += String.fromCharCode(this.filename[_i]);
    }
    
    this.filename = _s;
    
    if (this.flags.LHD_SALT) {
      info("Warning: Reading in 64-bit salt value");
      this.salt = bstream.readBits(64); // 8 bytes
    }
    
    if (this.flags.LHD_EXTTIME) {
      // 16-bit flags
      var extTimeFlags = bstream.readBits(16);
      
      // this is adapted straight out of arcread.cpp, Archive::ReadHeader()
      for (var I = 0; I < 4; ++I) {
        var rmode = extTimeFlags >> ((3-I)*4);
        if ((rmode & 8)==0)
          continue;
        if (I!=0)
          bstream.readBits(16);
          var count = (rmode&3);
          for (var J = 0; J < count; ++J) 
            bstream.readBits(8);
      }
    }
    
    if (this.flags.LHD_COMMENT) {
      info("Found a LHD_COMMENT");
    }
    
    
    while(headPos + this.headSize > bstream.bytePtr) bstream.readBits(1);
    
    info("Found FILE_HEAD with packSize=" + this.packSize + ", unpackedSize= " + this.unpackedSize + ", hostOS=" + this.hostOS + ", unpVer=" + this.unpVer + ", method=" + this.method + ", filename=" + this.filename);
    
    break;
  default:
    info("Found a header of type 0x" + byteValueToHexString(this.headType));
    // skip the rest of the header bytes (for now)
    bstream.readBytes( this.headSize - 7 );
    break;
  }
};

var BLOCK_LZ = 0,
  BLOCK_PPM = 1;

var rLDecode = [0,1,2,3,4,5,6,7,8,10,12,14,16,20,24,28,32,40,48,56,64,80,96,112,128,160,192,224],
  rLBits = [0,0,0,0,0,0,0,0,1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4,  4,  5,  5,  5,  5],
  rDBitLengthCounts = [4,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,14,0,12],
  rSDDecode = [0,4,8,16,32,64,128,192],
  rSDBits = [2,2,3, 4, 5, 6,  6,  6];
  
var rDDecode = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32,
			48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072,
			4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304,
			131072, 196608, 262144, 327680, 393216, 458752, 524288, 589824,
			655360, 720896, 786432, 851968, 917504, 983040];

var rDBits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5,
			5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14,
			15, 15, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16];

var rLOW_DIST_REP_COUNT = 16;

var rNC = 299,
  rDC = 60,
  rLDC = 17,
  rRC = 28,
  rBC = 20,
  rHUFF_TABLE_SIZE = (rNC+rDC+rRC+rLDC);

var UnpBlockType = BLOCK_LZ;
var UnpOldTable = new Array(rHUFF_TABLE_SIZE);

var BD = { //bitdecode
  DecodeLen: new Array(16),
  DecodePos: new Array(16),
  DecodeNum: new Array(rBC)
};
var LD = { //litdecode
  DecodeLen: new Array(16),
  DecodePos: new Array(16),
  DecodeNum: new Array(rNC)
};
var DD = { //distdecode
  DecodeLen: new Array(16),
  DecodePos: new Array(16),
  DecodeNum: new Array(rDC)
};
var LDD = { //low dist decode
  DecodeLen: new Array(16),
  DecodePos: new Array(16),
  DecodeNum: new Array(rLDC)
};
var RD = { //rep decode
  DecodeLen: new Array(16),
  DecodePos: new Array(16),
  DecodeNum: new Array(rRC)
};

var rBuffer;

// read in Huffman tables for RAR
function RarReadTables(bstream) {
  var BitLength = new Array(rBC),
    Table = new Array(rHUFF_TABLE_SIZE);

  // before we start anything we need to get byte-aligned
  bstream.readBits( (8 - bstream.bitPtr) & 0x7 );
  
  if (bstream.readBits(1)) {
    info("Error!  PPM not implemented yet");
    return;
  }
  
  if (!bstream.readBits(1)) { //discard old table
    for (var i = UnpOldTable.length; i--;) UnpOldTable[i] = 0;
  }

  // read in bit lengths
  for (var I = 0; I < rBC; ++I) {

    var Length = bstream.readBits(4);
    if (Length == 15) {
      var ZeroCount = bstream.readBits(4);
      if (ZeroCount == 0) {
        BitLength[I] = 15;
      }
      else {
        ZeroCount += 2;
        while (ZeroCount-- > 0 && I < rBC)
          BitLength[I++] = 0;
        --I;
      }
    }
    else {
      BitLength[I] = Length;
    }
  }
  
  // now all 20 bit lengths are obtained, we construct the Huffman Table:

  RarMakeDecodeTables(BitLength, 0, BD, rBC);
  
  var TableSize = rHUFF_TABLE_SIZE;
  //console.log(DecodeLen, DecodePos, DecodeNum);
  for (var i = 0; i < TableSize;) {
    var num = RarDecodeNumber(bstream, BD);
    if (num < 16) {
      Table[i] = (num + UnpOldTable[i]) & 0xf;
      i++;
    } else if(num < 18) {
      var N = (num == 16) ? (bstream.readBits(3) + 3) : (bstream.readBits(7) + 11);

      while (N-- > 0 && i < TableSize) {
        Table[i] = Table[i - 1];
        i++;
      }
    } else {
      var N = (num == 18) ? (bstream.readBits(3) + 3) : (bstream.readBits(7) + 11);

      while (N-- > 0 && i < TableSize) {
        Table[i++] = 0;
      }
    }
  }
  
  RarMakeDecodeTables(Table, 0, LD, rNC);
  RarMakeDecodeTables(Table, rNC, DD, rDC);
  RarMakeDecodeTables(Table, rNC + rDC, LDD, rLDC);
  RarMakeDecodeTables(Table, rNC + rDC + rLDC, RD, rRC);  
  
  for (var i = UnpOldTable.length; i--;) {
    UnpOldTable[i] = Table[i];
  }
  return true;
}


function RarDecodeNumber(bstream, dec) {
  var DecodeLen = dec.DecodeLen, DecodePos = dec.DecodePos, DecodeNum = dec.DecodeNum;
  var bitField = bstream.getBits() & 0xfffe;
  //some sort of rolled out binary search
  var bits = ((bitField < DecodeLen[8])?
    ((bitField < DecodeLen[4])?
      ((bitField < DecodeLen[2])?
        ((bitField < DecodeLen[1])?1:2)
       :((bitField < DecodeLen[3])?3:4))
     :(bitField < DecodeLen[6])?
        ((bitField < DecodeLen[5])?5:6)
        :((bitField < DecodeLen[7])?7:8))
    :((bitField < DecodeLen[12])?
      ((bitField < DecodeLen[10])?
        ((bitField < DecodeLen[9])?9:10)
       :((bitField < DecodeLen[11])?11:12))
     :(bitField < DecodeLen[14])?
        ((bitField < DecodeLen[13])?13:14)
        :15));
  bstream.readBits(bits);
  var N = DecodePos[bits] + ((bitField - DecodeLen[bits -1]) >>> (16 - bits));
  
  return DecodeNum[N];
}



function RarMakeDecodeTables(BitLength, offset, dec, size) {
  var DecodeLen = dec.DecodeLen, DecodePos = dec.DecodePos, DecodeNum = dec.DecodeNum;
  var LenCount = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      TmpPos = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      N = 0, M = 0;
  for (var i = DecodeNum.length; i--;) DecodeNum[i] = 0;
  for (var i = 0; i < size; i++) {
    LenCount[BitLength[i + offset] & 0xF]++;
  }
  LenCount[0] = 0;
  TmpPos[0] = 0;
  DecodePos[0] = 0;
  DecodeLen[0] = 0;
  
  for (var I = 1; I < 16; ++I) {
    N = 2 * (N+LenCount[I]);
    M = (N << (15-I));
    if (M > 0xFFFF)
      M = 0xFFFF;
    DecodeLen[I] = M;
    DecodePos[I] = DecodePos[I-1] + LenCount[I-1];
    TmpPos[I] = DecodePos[I];
  }
  for (I = 0; I < size; ++I)
    if (BitLength[I + offset] != 0)
      DecodeNum[ TmpPos[ BitLength[offset + I] & 0xF ]++] = I;

}

// TODO: implement
function Unpack15(bstream, Solid) {
  info("ERROR!  RAR 1.5 compression not supported");
}

function Unpack20(bstream, Solid) {
  var destUnpSize = rBuffer.data.length;
  var oldDistPtr = 0;
  
  RarReadTables20(bstream);
  while (destUnpSize > rBuffer.ptr) {
    var num = RarDecodeNumber(bstream, LD);
    if (num < 256) {
      rBuffer.insertByte(num);
      continue;
    }
    if (num > 269) {
      var Length = rLDecode[num -= 270] + 3;
      if ((Bits = rLBits[num]) > 0) {
        Length += bstream.readBits(Bits);
      }
      var DistNumber = RarDecodeNumber(bstream, DD);
      var Distance = rDDecode[DistNumber] + 1;
      if ((Bits = rDBits[DistNumber]) > 0) {
        Distance += bstream.readBits(Bits);
      }
      if (Distance >= 0x2000) {
        Length++;
        if(Distance >= 0x40000) Length++;
      }
      lastLength = Length;
      lastDist = rOldDist[oldDistPtr++ & 3] = Distance;
      RarCopyString(Length, Distance);
      continue;
    }
    if (num == 269) {
      RarReadTables20(bstream);

      RarUpdateProgress()
      
      continue;
    }
    if (num == 256) {
      lastDist = rOldDist[oldDistPtr++ & 3] = lastDist;
      RarCopyString(lastLength, lastDist);
      continue;
    }
    if (num < 261) {
      var Distance = rOldDist[(oldDistPtr - (num - 256)) & 3];
      var LengthNumber = RarDecodeNumber(bstream, RD);
      var Length = rLDecode[LengthNumber] +2;
      if ((Bits = rLBits[LengthNumber]) > 0) {
        Length += bstream.readBits(Bits);
      }
      if (Distance >= 0x101) {
        Length++;
        if (Distance >= 0x2000) {
          Length++
          if (Distance >= 0x40000) Length++;
        }
      }
      lastLength = Length;
      lastDist = rOldDist[oldDistPtr++ & 3] = Distance;
      RarCopyString(Length, Distance);
      continue;
    }
    if (num < 270) {
      var Distance = rSDDecode[num -= 261] + 1;
      if ((Bits = rSDBits[num]) > 0) {
        Distance += bstream.readBits(Bits);
      }
      lastLength = 2;
      lastDist = rOldDist[oldDistPtr++ & 3] = Distance;
      RarCopyString(2, Distance);
      continue;
    }
    
  }
  RarUpdateProgress()
}

function RarUpdateProgress() {
  var change = rBuffer.ptr - currentBytesUnarchivedInFile;
  currentBytesUnarchivedInFile = rBuffer.ptr;
  currentBytesUnarchived += change;
  postProgress();
}


var rNC20 = 298,
    rDC20 = 48,
    rRC20 = 28,
    rBC20 = 19,
    rMC20 = 257;

var UnpOldTable20 = new Array(rMC20 * 4);

function RarReadTables20(bstream) {
  var BitLength = new Array(rBC20);
  var Table = new Array(rMC20 * 4);
  var TableSize, N, I;
  var AudioBlock = bstream.readBits(1);
  if (!bstream.readBits(1))
    for (var i = UnpOldTable20.length; i--;) UnpOldTable20[i] = 0;
  TableSize = rNC20 + rDC20 + rRC20;
  for (var I = 0; I < rBC20; I++)
    BitLength[I] = bstream.readBits(4);
  RarMakeDecodeTables(BitLength, 0, BD, rBC20);
  I = 0;
  while (I < TableSize) {
    var num = RarDecodeNumber(bstream, BD);
    if (num < 16) {
      Table[I] = num + UnpOldTable20[I] & 0xf;
      I++;
    } else if(num == 16) {
      N = bstream.readBits(2) + 3;
      while (N-- > 0 && I < TableSize) {
        Table[I] = Table[I - 1];
        I++;
      }
    } else {
      if (num == 17) {
        N = bstream.readBits(3) + 3;
      } else {
        N = bstream.readBits(7) + 11;
      }
      while (N-- > 0 && I < TableSize) {
        Table[I++] = 0;
      }
    }
  }
  RarMakeDecodeTables(Table, 0, LD, rNC20);
  RarMakeDecodeTables(Table, rNC20, DD, rDC20);
  RarMakeDecodeTables(Table, rNC20 + rDC20, RD, rRC20);
  for (var i = UnpOldTable20.length; i--;) UnpOldTable20[i] = Table[i];
}

var lowDistRepCount = 0, prevLowDist = 0;

var rOldDist = [0,0,0,0];
var lastDist;
var lastLength;


function Unpack29(bstream, Solid) {
  // lazy initialize rDDecode and rDBits

  var DDecode = new Array(rDC);
  var DBits = new Array(rDC);
  
  var Dist=0,BitLength=0,Slot=0;
  
  for (var I = 0; I < rDBitLengthCounts.length; I++,BitLength++) {
    for (var J = 0; J < rDBitLengthCounts[I]; J++,Slot++,Dist+=(1<<BitLength)) {
      DDecode[Slot]=Dist;
      DBits[Slot]=BitLength;
    }
  }
  
  var Bits;
  //tablesRead = false;

  rOldDist = [0,0,0,0]
  
  lastDist = 0;
  lastLength = 0;

  for (var i = UnpOldTable.length; i--;) UnpOldTable[i] = 0;
    
  // read in Huffman tables
  RarReadTables(bstream);
 
  while (true) {
    var num = RarDecodeNumber(bstream, LD);
    
    if (num < 256) {
      rBuffer.insertByte(num);
      continue;
    }
    if (num >= 271) {
      var Length = rLDecode[num -= 271] + 3;
      if ((Bits = rLBits[num]) > 0) {
        Length += bstream.readBits(Bits);
      }
      var DistNumber = RarDecodeNumber(bstream, DD);
      var Distance = DDecode[DistNumber]+1;
      if ((Bits = DBits[DistNumber]) > 0) {
        if (DistNumber > 9) {
          if (Bits > 4) {
            Distance += ((bstream.getBits() >>> (20 - Bits)) << 4);
            bstream.readBits(Bits - 4);
            //todo: check this
          }
          if (lowDistRepCount > 0) {
            lowDistRepCount--;
            Distance += prevLowDist;
          } else {
            var LowDist = RarDecodeNumber(bstream, LDD);
            if (LowDist == 16) {
              lowDistRepCount = rLOW_DIST_REP_COUNT - 1;
              Distance += prevLowDist;
            } else {
              Distance += LowDist;
              prevLowDist = LowDist;
            }
          }
        } else {
          Distance += bstream.readBits(Bits);
        }
      }
      if (Distance >= 0x2000) {
        Length++;
        if (Distance >= 0x40000) {
          Length++;
        }
      }
      RarInsertOldDist(Distance);
      RarInsertLastMatch(Length, Distance);
      RarCopyString(Length, Distance);
      continue;
    }
    if (num == 256) {
      if (!RarReadEndOfBlock(bstream)) break;
      
      continue;
    }
    if (num == 257) {
      //console.log("READVMCODE");
      if (!RarReadVMCode(bstream)) break;
      continue;
    }
    if (num == 258) {
      if (lastLength != 0) {
        RarCopyString(lastLength, lastDist);
      }
      continue;
    }
    if (num < 263) {
      var DistNum = num - 259;
      var Distance = rOldDist[DistNum];

      for (var I = DistNum; I > 0; I--) {
        rOldDist[I] = rOldDist[I-1];
      }
      rOldDist[0] = Distance;

      var LengthNumber = RarDecodeNumber(bstream, RD);
      var Length = rLDecode[LengthNumber] + 2;
      if ((Bits = rLBits[LengthNumber]) > 0) {
        Length += bstream.readBits(Bits);
      }
      RarInsertLastMatch(Length, Distance);
      RarCopyString(Length, Distance);
      continue;
    }
    if (num < 272) {
      var Distance = rSDDecode[num -= 263] + 1;
      if ((Bits = rSDBits[num]) > 0) {
        Distance += bstream.readBits(Bits);
      }
      RarInsertOldDist(Distance);
      RarInsertLastMatch(2, Distance);
      RarCopyString(2, Distance);
      continue;
    }
    
  }
  RarUpdateProgress()
}

function RarReadEndOfBlock(bstream) {
  
  RarUpdateProgress()


  var NewTable = false, NewFile = false;
  if (bstream.readBits(1)) {
    NewTable = true;
  } else {
    NewFile = true;
    NewTable = !!bstream.readBits(1);
  }
  //tablesRead = !NewTable;
  return !(NewFile || NewTable && !RarReadTables(bstream));
}


function RarReadVMCode(bstream) {
  var FirstByte = bstream.readBits(8);
  var Length = (FirstByte & 7) + 1;
  if (Length == 7) {
    Length = bstream.readBits(8) + 7;
  } else if(Length == 8) {
    Length = bstream.readBits(16);
  }
  var vmCode = [];
  for(var I = 0; I < Length; I++) {
    //do something here with cheking readbuf
    vmCode.push(bstream.readBits(8));
  }
  return RarAddVMCode(FirstByte, vmCode, Length);
}

function RarAddVMCode(firstByte, vmCode, length) {
  //console.log(vmCode);
  if (vmCode.length > 0) {
    info("Error! RarVM not supported yet!");
  }
  return true;
}

function RarInsertLastMatch(length, distance) {
  lastDist = distance;
  lastLength = length;
}

function RarInsertOldDist(distance) {
  rOldDist.splice(3,1);
  rOldDist.splice(0,0,distance);
}

//this is the real function, the other one is for debugging
function RarCopyString(length, distance) {
  var destPtr = rBuffer.ptr - distance;
  if(destPtr < 0){    
    var l = rOldBuffers.length;
    while(destPtr < 0){
      destPtr = rOldBuffers[--l].data.length + destPtr;
    }
    //TODO: lets hope that it never needs to read beyond file boundaries
    while(length--) rBuffer.insertByte(rOldBuffers[l].data[destPtr++]);

  }
  if (length > distance) {
    while(length--) rBuffer.insertByte(rBuffer.data[destPtr++]);
  } else {
    rBuffer.insertBytes(rBuffer.data.subarray(destPtr, destPtr + length));
  }
  
}

var rOldBuffers = []
// v must be a valid RarVolume
function unpack(v) {

  // TODO: implement what happens when unpVer is < 15
  var Ver = v.header.unpVer <= 15 ? 15 : v.header.unpVer,
    Solid = v.header.LHD_SOLID,
    bstream = new bitjs.io.BitStream(v.fileData.buffer, true /* rtl */, v.fileData.byteOffset, v.fileData.byteLength );
  
  rBuffer = new bitjs.io.ByteBuffer(v.header.unpackedSize);

  info("Unpacking "+v.filename+" RAR v"+Ver);
    
  switch(Ver) {
    case 15: // rar 1.5 compression
      Unpack15(bstream, Solid);
      break;
    case 20: // rar 2.x compression
    case 26: // files larger than 2GB
      Unpack20(bstream, Solid);
      break;
    case 29: // rar 3.x compression
    case 36: // alternative hash
      Unpack29(bstream, Solid);
      break;
  } // switch(method)
  
  rOldBuffers.push(rBuffer);
  //TODO: clear these old buffers when there's over 4MB of history
  return rBuffer.data;
}

// bstream is a bit stream
var RarLocalFile = function(bstream) {
  
  this.header = new RarVolumeHeader(bstream);
  this.filename = this.header.filename;
  
  if (this.header.headType != FILE_HEAD && this.header.headType != ENDARC_HEAD) {
    this.isValid = false;
    info("Error! RAR Volume did not include a FILE_HEAD header ");
  }
  else {
    // read in the compressed data
    this.fileData = null;
    if (this.header.packSize > 0) {
      this.fileData = bstream.readBytes(this.header.packSize);
      this.isValid = true;
    }
  }
};

RarLocalFile.prototype.unrar = function() {

  if (!this.header.flags.LHD_SPLIT_BEFORE) {
    // unstore file
    if (this.header.method == 0x30) {
      info("Unstore "+this.filename);
      this.isValid = true;
      
      currentBytesUnarchivedInFile += this.fileData.length;
      currentBytesUnarchived += this.fileData.length;

      // Create a new buffer and copy it over.
      var len = this.header.packSize;
      var newBuffer = new bitjs.io.ByteBuffer(len);
      newBuffer.insertBytes(this.fileData);
      this.fileData = newBuffer.data;
    } else {
      this.isValid = true;
      this.fileData = unpack(this);
    }
  }
}

var unrar = function(arrayBuffer) {
  currentFilename = "";
  currentFileNumber = 0;
  currentBytesUnarchivedInFile = 0;
  currentBytesUnarchived = 0;
  totalUncompressedBytesInArchive = 0;
  totalFilesInArchive = 0;

  postMessage(new bitjs.archive.UnarchiveStartEvent());
  var bstream = new bitjs.io.BitStream(arrayBuffer, false /* rtl */);
  
  var header = new RarVolumeHeader(bstream);
  if (header.crc == 0x6152 && 
    header.headType == 0x72 && 
    header.flags.value == 0x1A21 &&
    header.headSize == 7) {
    info("Found RAR signature");

    var mhead = new RarVolumeHeader(bstream);
    if (mhead.headType != MAIN_HEAD) {
      info("Error! RAR did not include a MAIN_HEAD header");
    }
    else {
      var localFiles = [],
        localFile = null;
      do {
        try {
          localFile = new RarLocalFile(bstream);
          info("RAR localFile isValid=" + localFile.isValid + ", volume packSize=" + localFile.header.packSize);
          if (localFile && localFile.isValid && localFile.header.packSize > 0) {
            totalUncompressedBytesInArchive += localFile.header.unpackedSize;
            localFiles.push(localFile);
          } else if (localFile.header.packSize == 0 && localFile.header.unpackedSize == 0) {
            localFile.isValid = true;
          }
        } catch(err) {
          break;
        }
        //info("bstream" + bstream.bytePtr+"/"+bstream.bytes.length);
      } while( localFile.isValid );
      totalFilesInArchive = localFiles.length;
      
      // now we have all information but things are unpacked
      // TODO: unpack
      localFiles = localFiles.sort(function(a,b) {
			  var aname = a.filename;
			  var bname = b.filename;
			  return aname > bname ? 1 : -1;

        // extract the number at the end of both filenames
			  /*
			  var aindex = aname.length, bindex = bname.length;

			  // Find the last number character from the back of the filename.
			  while (aname[aindex-1] < '0' || aname[aindex-1] > '9') --aindex;
			  while (bname[bindex-1] < '0' || bname[bindex-1] > '9') --bindex;

			  // Find the first number character from the back of the filename
			  while (aname[aindex-1] >= '0' && aname[aindex-1] <= '9') --aindex;
			  while (bname[bindex-1] >= '0' && bname[bindex-1] <= '9') --bindex;

			  // parse them into numbers and return comparison
			  var anum = parseInt(aname.substr(aindex), 10),
				  bnum = parseInt(bname.substr(bindex), 10);
			  return bnum - anum;*/
		  });

      info(localFiles.map(function(a){return a.filename}).join(', '));
      for (var i = 0; i < localFiles.length; ++i) {
        var localfile = localFiles[i];
        
        // update progress 
        currentFilename = localfile.header.filename;
        currentBytesUnarchivedInFile = 0;
        
        // actually do the unzipping
        localfile.unrar();
        
        if (localfile.isValid) {
          postMessage(new bitjs.archive.UnarchiveExtractEvent(localfile));
          postProgress();
        }
      }
      
      postProgress();
    }
  }
  else {
    err("Invalid RAR file");
  }
  postMessage(new bitjs.archive.UnarchiveFinishEvent());
};

// event.data.file has the ArrayBuffer.
onmessage = function(event) {
  var ab = event.data.file;
  unrar(ab, true);
};
