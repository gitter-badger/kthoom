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

// ============================================================================================== //

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

  /** @type {Array<VM_PreparedCommand>} */
  this.AltCmd = null;

  /** @type {Uint8Array} */
  this.GlobalData = new Uint8Array();

  /** @type {Uint8Array} */
  this.StaticData = new Uint8Array(); // static data contained in DB operators

  /** @type {Uint32Array} */
  this.InitR = new Uint32Array(7);

  /**
   * A pointer to bytes that have been filtered by a program.
   * @type {Uint8Array}
   */
  this.FilteredData = null;
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


/**
 * Should inherit from bitjs.io.BitStream.
 * @constructor
 */
var RarVM = function() {
  /** @private {Uint8Array} */
  this.mem_ = null;

  /** @private {Uint32Array<number>} */
  this.R_ = new Uint32Array(8);

  /** @private {number} */
  this.flags_ = 0;
};

/**
 * Initializes the memory of the VM.
 */
RarVM.prototype.init = function() {
  if (!this.mem_) {
    this.mem_ = new Uint8Array(VM_MEMSIZE);
  }
};

/**
 * @param {Uint8Array} code
 * @return {VM_StandardFilters}
 */
RarVM.prototype.isStandardFilter = function(code) {
  var codeCRC = (CRC(0xffffffff, code, code.length) ^ 0xffffffff) >>> 0;
  for (var i = 0; i < StdList.length; ++i) {
    if (StdList[i].CRC == codeCRC && StdList[i].Length == code.length)
      return StdList[i].Type;
  }

  return VM_StandardFilters.VMSF_NONE;
};

/**
 * @param {VM_PreparedOperand} op
 * @param {boolean} byteMode
 * @param {bitjs.io.BitStream} bstream A rtl bit stream.
 */
RarVM.prototype.decodeArg = function(op, byteMode, bstream) {
  var data = bstream.peekBits(16);
  if (data & 0x8000) {
    op.Type = VM_OpType.VM_OPREG;        // Operand is register (R[0]..R[7])
    bstream.readBits(1);                 // 1 flag bit and...
    op.Data = bstream.readBits(3);       // ... 3 register number bits
    op.Addr = [this.R_[op.Data]] // TODO &R[Op.Data] // Register address
  } else {
    if ((data & 0xc000) == 0) {
      op.Type = VM_OpType.VM_OPINT; // Operand is integer
      bstream.readBits(2); // 2 flag bits
      if (byteMode) {
        op.Data = bstream.readBits(8);         // Byte integer.
      } else {
        op.Data = RarVM.readData(bstream);     // 32 bit integer.
      }
    } else {
      // Operand is data addressed by register data, base address or both.
      op.Type = VM_OpType.VM_OPREGMEM;
      if ((data & 0x2000) == 0) {
        bstream.readBits(3); // 3 flag bits
        // Base address is zero, just use the address from register.
        op.Data = bstream.readBits(3); // (Data>>10)&7
        op.Addr = [this.R_[op.Data]]; // TODO &R[op.Data]
        op.Base = 0;
      } else {
        bstream.readBits(4); // 4 flag bits
        if ((data & 0x1000) == 0) {
          // Use both register and base address.
          op.Data = bstream.readBits(3);
          op.Addr = [this.R_[op.Data]]; // TODO &R[op.Data]
        } else {
          // Use base address only. Access memory by fixed address.
          op.Data = 0;
        }
        op.Base = RarVM.readData(bstream); // Read base address.
      }
    }
  }
};

/**
 * @param {VM_PreparedProgram} prg
 */
RarVM.prototype.execute = function(prg) {
  this.R_.set(prg.InitR);

  var globalSize = Math.min(prg.GlobalData.length, VM_GLOBALMEMSIZE);
  if (globalSize) {
    this.mem_.set(prg.GlobalData.subarray(0, globalSize), VM_GLOBALMEMADDR);
  }

  var staticSize = Math.min(prg.StaticData.length, VM_GLOBALMEMSIZE - globalSize);
  if (staticSize) {
    this.mem_.set(prg.StaticData.subarray(0, staticSize), VM_GLOBALMEMADDR + globalSize);
  }

  this.R_[7] = VM_MEMSIZE;
  this.flags_ = 0;

  var preparedCodes = prg.AltCmd ? prg.AltCmd : prg.Cmd;
  if (prg.Cmd.length > 0 && !this.executeCode(preparedCodes)) {
    // Invalid VM program. Let's replace it with 'return' command.
    preparedCode.OpCode = VM_Commands.VM_RET;
  }

  var dataView = new DataView(this.mem_.buffer, VM_GLOBALMEMADDR);
  var newBlockPos = dataView.getUint32(0x20, true /* little endian */) & VM_MEMMASK;
  var newBlockSize = dataView.getUint32(0x1c, true /* little endian */) & VM_MEMMASK;
  if (newBlockPos + newBlockSize >= VM_MEMSIZE) {
    newBlockPos = newBlockSize = 0;
  }
  prg.FilteredData = this.mem_.subarray(newBlockPos, newBlockPos + newBlockSize);

  prg.GlobalData = new Uint8Array(0);

  var dataSize = Math.min(dataView.getUint32(0x30),
      (VM_GLOBALMEMSIZE - VM_FIXEDGLOBALSIZE));
  if (dataSize != 0) {
    var len = dataSize + VM_FIXEDGLOBALSIZE;
    prg.GlobalData = new Uint8Array(len);
    prg.GlobalData.set(mem.subarray(VM_GLOBALMEMADDR, VM_GLOBALMEMADDR + len));
  }
};

/**
 * @param {Array<VM_PreparedCommand>} preparedCodes
 * @return {boolean}
 */
RarVM.prototype.executeCode = function(preparedCodes) {
  var codeIndex = 0;
  var cmd = preparedCodes[codeIndex];
  // TODO: Why is this an infinite loop instead of just returning
  // when a VM_RET is hit?
  while (1) {
    switch (cmd.OpCode) {
      case VM_Commands.VM_RET:
        if (this.R_[7] >= VM_MEMSIZE) {
          return true;
        }
        //SET_IP(GET_VALUE(false,(uint *)&Mem[R[7] & VM_MEMMASK]));
        this.R_[7] += 4;
        continue;

      case VM_Commands.VM_STANDARD:
        this.executeStandardFilter(cmd.Op1.Data);
        break;
    } // switch (cmd.OpCode)
    codeIndex++;
    cmd = preparedCodes[codeIndex];
  }
};

/**
 * @param {number} filterType
 */
RarVM.prototype.executeStandardFilter = function(filterType) {
  switch (filterType) {
    case VM_StandardFilters.VMSF_DELTA:
      var dataSize = this.R_[4];
      var channels = this.R_[0];
      var srcPos = 0;
      var border = dataSize * 2;

      //SET_VALUE(false,&Mem[VM_GLOBALMEMADDR+0x20],DataSize);
      var dataView = new DataView(this.mem_.buffer, VM_GLOBALMEMADDR);
      dataView.setUint32(0x20, dataSize, true /* little endian */);

      if (dataSize >= VM_GLOBALMEMADDR / 2) {
        break;
      }

      // Bytes from same channels are grouped to continual data blocks,
      // so we need to place them back to their interleaving positions.
      for (var curChannel = 0; curChannel < channels; ++curChannel) {
        var prevByte = 0;
        for (var destPos = dataSize + curChannel; destPos < border; destPos += channels) {
          prevByte = (prevByte - this.mem_[srcPos++]) & 0xff;
          this.mem_[destPos] = prevByte;
        }
      }

      break;
  }
};

/**
 * @param {Uint8Array} code
 * @param {VM_PreparedProgram} prg
 */
RarVM.prototype.prepare = function(code, prg) {
  var codeSize = code.length;

  //InitBitInput();
  //memcpy(InBuf,Code,Min(CodeSize,BitInput::MAX_SIZE));
  var bstream = new bitjs.io.BitStream(code.buffer, true /* rtl */);

  // Calculate the single byte XOR checksum to check validity of VM code.
  var xorSum=0;
  for (var i = 1; i < codeSize; ++i) {
    xorSum ^= code[i];
  }

  bstream.readBits(8);

  prg.Cmd = [];  // TODO: Is this right?  I don't see it being done in rarvm.cpp.

  // VM code is valid if equal.
  if (xorSum == code[0]) {
    var filterType = this.isStandardFilter(code);
    if (filterType != VM_StandardFilters.VMSF_NONE) {
      // VM code is found among standard filters.
      var curCmd = new VM_PreparedCommand();
      prg.Cmd.push(curCmd);

      curCmd.OpCode = VM_Commands.VM_STANDARD;
      curCmd.Op1.Data = filterType;
      // TODO: Addr=&CurCmd->Op1.Data
      curCmd.Op1.Addr = [curCmd.Op1.Data];
      curCmd.Op2.Addr = [null]; // &CurCmd->Op2.Data;
      curCmd.Op1.Type = VM_OpType.VM_OPNONE;
      curCmd.Op2.Type = VM_OpType.VM_OPNONE;
      codeSize = 0;
    }

    var dataFlag = bstream.readBits(1);

    // Read static data contained in DB operators. This data cannot be
    // changed, it is a part of VM code, not a filter parameter.

    if (dataFlag & 0x8000) {
      var dataSize = RarVM.readData(bstream) + 1;
      // TODO: This accesses the byte pointer of the bstream directly.  Is that ok?
      for (var i = 0; i < bstream.bytePtr < codeSize && i < dataSize; ++i) {
        // Append a byte to the program's static data.
        var newStaticData = new Uint8Array(prg.StaticData.length + 1);
        newStaticData.set(prg.StaticData);
        newStaticData[newStaticData.length - 1] = bstream.readBits(8);
        prg.StaticData = newStaticData;
      }
    }

    while (bstream.bytePtr < codeSize) {
      var curCmd = new VM_PreparedCommand();
      prg.Cmd.push(curCmd); // Prg->Cmd.Add(1)
      var flag = bstream.peekBits(1);
      if (!flag) { // (Data&0x8000)==0
        curCmd.OpCode = bstream.readBits(4);
      } else {
        curCmd.OpCode = (bstream.readBits(6) - 24);
      }

      if (VM_CmdFlags[curCmd.OpCode] & VMCF_BYTEMODE) {
        curCmd.ByteMode = (bstream.readBits(1) != 0);
      } else {
        curCmd.ByteMode = 0;
      }
      curCmd.Op1.Type = VM_OpType.VM_OPNONE;
      curCmd.Op2.Type = VM_OpType.VM_OPNONE;
      var opNum = (VM_CmdFlags[curCmd.OpCode] & VMCF_OPMASK);
      curCmd.Op1.Addr = null;
      curCmd.Op2.Addr = null;
      if (opNum > 0) {
        this.decodeArg(curCmd.Op1, curCmd.ByteMode, bstream); // reading the first operand
        if (opNum == 2) {
          this.decodeArg(curCmd.Op2, curCmd.ByteMode, bstream); // reading the second operand
        } else {
          if (curCmd.Op1.Type == VM_OpType.VM_OPINT && (VM_CmdFlags[curCmd.OpCode] & (VMCF_JUMP|VMCF_PROC))) {
            // Calculating jump distance.
            var distance = curCmd.Op1.Data;
            if (distance >= 256) {
              distance -= 256;
            } else {
              if (distance >= 136) {
                distance -= 264;
              } else {
                if (distance >= 16) {
                  distance -= 8;
                } else {
                  if (distance >= 8) {
                    distance -= 16;
                  }
                }
              }
              distance += prg.Cmd.length;
            }
            curCmd.Op1.Data = distance;
          }
        }
      } // if (OpNum>0)
    } // while ((uint)InAddr<CodeSize)
  } // if (XorSum==Code[0])

  var curCmd = new VM_PreparedCommand();
  prg.Cmd.push(curCmd);
  curCmd.OpCode = VM_Commands.VM_RET;
  // TODO: Addr=&CurCmd->Op1.Data
  curCmd.Op1.Addr = [curCmd.Op1.Data];
  curCmd.Op2.Addr = [curCmd.Op2.Data];
  curCmd.Op1.Type = VM_OpType.VM_OPNONE;
  curCmd.Op2.Type = VM_OpType.VM_OPNONE;

  // If operand 'Addr' field has not been set by DecodeArg calls above,
  // let's set it to point to operand 'Data' field. It is necessary for
  // VM_OPINT type operands (usual integers) or maybe if something was
  // not set properly for other operands. 'Addr' field is required
  // for quicker addressing of operand data.
  for (var i = 0; i < prg.Cmd.length; ++i) {
    var cmd = prg.Cmd[i];
    if (cmd.Op1.Addr == null) {
      cmd.Op1.Addr = [cmd.Op1.Data];
    }
    if (cmd.Op2.Addr == null) {
      cmd.Op2.Addr = [cmd.Op2.Data];
    }
  }

/*
#ifdef VM_OPTIMIZE
  if (CodeSize!=0)
    Optimize(Prg);
#endif
  */
};

/**
 * @param {Uint8Array} arr The byte array to set a value in.
 * @param {number} value The unsigned 32-bit value to set.
 * @param {number} offset Offset into arr to start setting the value, defaults to 0.
 */
RarVM.prototype.setLowEndianValue = function(arr, value, offset) {
  var i = offset || 0;
  arr[i]     = value & 0xff;
  arr[i + 1] = (value >>> 8) & 0xff;
  arr[i + 2] = (value >>> 16) & 0xff;
  arr[i + 3] = (value >>> 24) & 0xff;
};

/**
 * Sets a number of bytes of the VM memory at the given position from a
 * source buffer of bytes.
 * @param {number} pos The position in the VM memory to start writing to.
 * @param {Uint8Array} buffer The source buffer of bytes.
 * @param {number} dataSize The number of bytes to set.
 */
RarVM.prototype.setMemory = function(pos, buffer, dataSize) {
  if (pos < VM_MEMSIZE) {
    var numBytes = Math.min(dataSize, VM_MEMSIZE - pos);
    for (var i = 0; i < numBytes; ++i) {
      this.mem_[pos + i] = buffer[i];
    }
  }
};

/**
 * Static function that reads in the next set of bits for the VM
 * (might return 4, 8, 16 or 32 bits).
 * @param {bitjs.io.BitStream} bstream A RTL bit stream.
 * @return {number} The value of the bits read.
 */
RarVM.readData = function(bstream) {
  // Read in the first 2 bits.
  var flags = bstream.readBits(2);
  switch (flags) { // Data&0xc000
    // Return the next 4 bits.
    case 0:
      return bstream.readBits(4); // (Data>>10)&0xf

    case 1: // 0x4000
      // 0x3c00 => 0011 1100 0000 0000
      if (bstream.peekBits(4) == 0) { // (Data&0x3c00)==0
        // Skip the 4 zero bits.
        bstream.readBits(4);
        // Read in the next 8 and pad with 1s to 32 bits.
        return (0xffffff00 | bstream.readBits(8)) >>> 0; // ((Data>>2)&0xff)
      }

      // Else, read in the next 8.
      return bstream.readBits(8);

    // Read in the next 16.
    case 2: // 0x8000
      var val = bstream.getBits();
      bstream.readBits(16);
      return val; //bstream.readBits(16);

    // case 3
    default:
      return (bstream.readBits(16) << 16) | bstream.readBits(16);
  }
};

// ============================================================================================== //

// Unpack code specific to RarVM

var VM = new RarVM();

/**
 * Filters code, one entry per filter.
 * @type {Array<UnpackFilter>}
 */
var Filters = [];

/**
 * Filters stack, several entrances of same filter are possible.
 * @type {Array<UnpackFilter>}
 */
var PrgStack = [];

/**
 * Lengths of preceding blocks, one length per filter. Used to reduce
 * size required to write block length if lengths are repeating.
 * @type {Array<number>}
 */
var OldFilterLengths = [];

var LastFilter = 0;

function InitFilters() {
  OldFilterLengths = [];
  LastFilter = 0;
  Filters = [];
  PrgStack = [];
}


/**
 * @param {number} firstByte The first byte (flags).
 * @param {Uint8Array} vmCode An array of bytes.
 */
function RarAddVMCode(firstByte, vmCode) {
  VM.init();
  var bstream = new bitjs.io.BitStream(vmCode.buffer, true /* rtl */);

  var filtPos;
  if (firstByte & 0x80) {
    filtPos = RarVM.readData(bstream);
    if (filtPos == 0) {
      InitFilters();
    } else {
      filtPos--;
    }
  } else {
    filtPos = LastFilter;
  }

  if (filtPos > Filters.length || filtPos > OldFilterLengths.length) {
    return false;
  }

  LastFilter = filtPos;
  var newFilter = (filtPos == Filters.length);

  // new filter for PrgStack
  var stackFilter = new UnpackFilter();
  var filter = null;
  // new filter code, never used before since VM reset
  if (newFilter) {
    // too many different filters, corrupt archive
    if (filtPos > 1024) {
      return false;
    }

    filter = new UnpackFilter();
    Filters.push(filter);
    stackFilter.ParentFilter = (Filters.length - 1);
    OldFilterLengths.push(0); // OldFilterLengths.Add(1)
    filter.ExecCount = 0;
  } else { // filter was used in the past
    filter = Filters[filtPos];
    stackFilter.ParentFilter = filtPos;
    filter.ExecCount++;
  }

  var emptyCount = 0;
  for (var i = 0; i < PrgStack.length; ++i) {
    PrgStack[i - emptyCount] = PrgStack[i];

    if (PrgStack[i] == null) {
      emptyCount++;
    }
    if (emptyCount > 0) {
      PrgStack[i] = null;
    }
  }

  if (emptyCount == 0) {
    PrgStack.push(null); //PrgStack.Add(1);
    emptyCount = 1;
  }

  var stackPos = PrgStack.length - emptyCount;
  PrgStack[stackPos] = stackFilter;
  stackFilter.ExecCount = filter.ExecCount;

  var blockStart = RarVM.readData(bstream);
  if (firstByte & 0x40) {
    blockStart += 258;
  }
  stackFilter.BlockStart = (blockStart + rBuffer.ptr) & MAXWINMASK;

  if (firstByte & 0x20) {
    stackFilter.BlockLength = RarVM.readData(bstream);
  } else {
    stackFilter.BlockLength = filtPos < OldFilterLengths.length
        ? OldFilterLengths[filtPos]
        : 0;
  }
  stackFilter.NextWindow = (wBuffer.ptr != rBuffer.ptr) &&
      (((wBuffer.ptr - rBuffer.ptr) & MAXWINMASK) <= blockStart);

  OldFilterLengths[filtPos] = stackFilter.BlockLength;

  for (var i = 0; i < 7; ++i) {
    stackFilter.Prg.InitR[i] = 0;
  }
  stackFilter.Prg.InitR[3] = VM_GLOBALMEMADDR;
  stackFilter.Prg.InitR[4] = stackFilter.BlockLength;
  stackFilter.Prg.InitR[5] = stackFilter.ExecCount;

  // set registers to optional parameters if any
  if (firstByte & 0x10) {
    var initMask = bstream.readBits(7);
    for (var i = 0; i < 7; ++i) {
      if (initMask & (1 << i)) {
        stackFilter.Prg.InitR[i] = RarVM.readData(bstream);
      }
    }
  }

  if (newFilter) {
    var vmCodeSize = RarVM.readData(bstream);
    if (vmCodeSize >= 0x10000 || vmCodeSize == 0) {
      return false;
    }
    var vmCode = new Uint8Array(vmCodeSize);
    for (var i = 0; i < vmCodeSize; ++i) {
      //if (Inp.Overflow(3))
      //  return(false);
      vmCode[i] = bstream.readBits(8);
    }
    VM.prepare(vmCode, filter.Prg);
  }
  stackFilter.Prg.Cmd = filter.Prg.Cmd;
  stackFilter.Prg.AltCmd = filter.Prg.Cmd;

  var staticDataSize = filter.Prg.StaticData.length;
  if (staticDataSize > 0 && staticDataSize < VM_GLOBALMEMSIZE) {
    // read statically defined data contained in DB commands
    for (var i = 0; i < staticDataSize; ++i) {
      stackFilter.Prg.StaticData[i] = filter.Prg.StaticData[i];
    }
  }

  if (stackFilter.Prg.GlobalData.length < VM_FIXEDGLOBALSIZE) {
    stackFilter.Prg.GlobalData = new Uint8Array(VM_FIXEDGLOBALSIZE);
  }

  var globalData = stackFilter.Prg.GlobalData;
  for (var i = 0; i < 7; ++i) {
    VM.setLowEndianValue(globalData, stackFilter.Prg.InitR[i], i * 4);
  }

  VM.setLowEndianValue(globalData, stackFilter.BlockLength, 0x1c);
  VM.setLowEndianValue(globalData, 0, 0x20);
  VM.setLowEndianValue(globalData, stackFilter.ExecCount, 0x2c);
  for (var i = 0; i < 16; ++i) {
    globalData[0x30 + i] = 0;
  }

  // put data block passed as parameter if any
  if (firstByte & 8) {
    //if (Inp.Overflow(3))
    //  return(false);
    var dataSize = RarVM.readData(bstream);
    if (dataSize > (VM_GLOBALMEMSIZE - VM_FIXEDGLOBALSIZE)) {
      return(false);
    }

    var curSize = stackFilter.Prg.GlobalData.length;
    if (curSize < dataSize + VM_FIXEDGLOBALSIZE) {
      // Resize global data and update the stackFilter and local variable.
      var numBytesToAdd = dataSize + VM_FIXEDGLOBALSIZE - curSize;
      var newGlobalData = new Uint8Array(globalData.length + numBytesToAdd);
      newGlobalData.set(globalData);

      stackFilter.Prg.GlobalData = newGlobalData;
      globalData = newGlobalData;
    }
    //byte *GlobalData=&StackFilter->Prg.GlobalData[VM_FIXEDGLOBALSIZE];
    for (var i = 0; i < dataSize; ++i) {
      //if (Inp.Overflow(3))
      //  return(false);
      globalData[VM_FIXEDGLOBALSIZE + i] = bstream.readBits(8);
    }
  }

  return true;
}


/**
 * @param {!bitjs.io.BitStream} bstream
 */
function RarReadVMCode(bstream) {
  var firstByte = bstream.readBits(8);
  var length = (firstByte & 7) + 1;
  if (length == 7) {
    length = bstream.readBits(8) + 7;
  } else if (length == 8) {
    length = bstream.readBits(16);
  }

  // Read all bytes of VM code into an array.
  var vmCode = new Uint8Array(length);
  for (var i = 0; i < length; i++) {
    // Do something here with checking readbuf.
    vmCode[i] = bstream.readBits(8);
  }
  return RarAddVMCode(firstByte, vmCode);
}

// ============================================================================================== //

/**
 * @param {bitjs.io.BitStream} bstream
 * @constructor
 */
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
        if ((rmode & 8)==0) {
          continue;
        }
        if (I!=0)
          bstream.readBits(16);
          var count = (rmode&3);
          for (var J = 0; J < count; ++J) {
            bstream.readBits(8);
          }
      }
    }
    
    if (this.flags.LHD_COMMENT) {
      info("Found a LHD_COMMENT");
    }
    
    
    while (headPos + this.headSize > bstream.bytePtr) {
      bstream.readBits(1);
    }
    
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

/**
 * @type {Array<bitjs.io.ByteBuffer>}
 */
var rOldBuffers = [];

/**
 * The current buffer we are unpacking to.
 * @type {bitjs.io.ByteBuffer}
 */
var rBuffer;

/**
 * The buffer of the final bytes after filtering (only used in Unpack29).
 * @type {bitjs.io.ByteBuffer}
 */
var wBuffer;


/**
 * In unpack.cpp, UnpPtr keeps track of what bytes have been unpacked
 * into the Window buffer and WrPtr keeps track of what bytes have been
 * actually written to disk after the unpacking and optional filtering
 * has been done.
 *
 * In our case, rBuffer is the buffer for the unpacked bytes and wBuffer is
 * the final output bytes.
 */


/**
 * Read in Huffman tables for RAR
 * @param {bitjs.io.BitStream} bstream
 */
function RarReadTables(bstream) {
  var BitLength = new Array(rBC);
  var Table = new Array(rHUFF_TABLE_SIZE);

  // before we start anything we need to get byte-aligned
  bstream.readBits( (8 - bstream.bitPtr) & 0x7 );
  
  if (bstream.readBits(1)) {
    info("Error!  PPM not implemented yet");
    return;
  }
  
  if (!bstream.readBits(1)) { //discard old table
    for (var i = UnpOldTable.length; i--;) {
      UnpOldTable[i] = 0;
    }
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
    } else if (num < 18) {
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
  var DecodeLen = dec.DecodeLen;
  var DecodePos = dec.DecodePos;
  var DecodeNum = dec.DecodeNum;
  var LenCount = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  var TmpPos = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  var N = 0;
  var M = 0;

  for (var i = DecodeNum.length; i--;) {
    DecodeNum[i] = 0;
  }
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
    if (M > 0xFFFF) {
      M = 0xFFFF;
    }
    DecodeLen[I] = M;
    DecodePos[I] = DecodePos[I-1] + LenCount[I-1];
    TmpPos[I] = DecodePos[I];
  }
  for (I = 0; I < size; ++I) {
    if (BitLength[I + offset] != 0) {
      DecodeNum[ TmpPos[ BitLength[offset + I] & 0xF ]++] = I;
    }
  }

}

// TODO: implement
/**
 * @param {bitjs.io.BitStream} bstream
 * @param {boolean} Solid
 */
function Unpack15(bstream, Solid) {
  info("ERROR!  RAR 1.5 compression not supported");
}

/**
 * Unpacks the bit stream into rBuffer using the Unpack20 algorithm.
 * @param {bitjs.io.BitStream} bstream
 * @param {boolean} Solid
 */
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
        if (Distance >= 0x40000) {
          Length++;
        }
      }
      lastLength = Length;
      lastDist = rOldDist[oldDistPtr++ & 3] = Distance;
      RarCopyString(Length, Distance);
      continue;
    }
    if (num == 269) {
      RarReadTables20(bstream);
      RarUpdateProgress();
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
          if (Distance >= 0x40000) {
            Length++;
          }
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
  RarUpdateProgress();
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
  if (!bstream.readBits(1)) {
    for (var i = UnpOldTable20.length; i--;) {
      UnpOldTable20[i] = 0;
    }
  }
  TableSize = rNC20 + rDC20 + rRC20;
  for (var I = 0; I < rBC20; I++) {
    BitLength[I] = bstream.readBits(4);
  }
  RarMakeDecodeTables(BitLength, 0, BD, rBC20);
  I = 0;
  while (I < TableSize) {
    var num = RarDecodeNumber(bstream, BD);
    if (num < 16) {
      Table[I] = num + UnpOldTable20[I] & 0xf;
      I++;
    } else if (num == 16) {
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
  for (var i = UnpOldTable20.length; i--;) {
    UnpOldTable20[i] = Table[i];
  }
}

var lowDistRepCount = 0;
var prevLowDist = 0;

var rOldDist = [0,0,0,0];
var lastDist;
var lastLength;


/**
 * Unpacks the bit stream into rBuffer using the Unpack29 algorithm.
 * @param {bitjs.io.BitStream} bstream
 * @param {boolean} Solid
 */
function Unpack29(bstream, Solid) {
  // lazy initialize rDDecode and rDBits

  var DDecode = new Array(rDC);
  var DBits = new Array(rDC);
  
  var Dist = 0;
  var BitLength = 0;
  var Slot = 0;
  
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

  for (var i = UnpOldTable.length; i--;) {
    UnpOldTable[i] = 0;
  }
    
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
      var Distance = DDecode[DistNumber] + 1;
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
      if (!RarReadEndOfBlock(bstream)) {
        break;
      }
      continue;
    }
    if (num == 257) {
      if (!RarReadVMCode(bstream)) {
        break;
      }
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
  } // while (true)
  RarUpdateProgress();
  RarWriteBuf();
}

/**
 * Does stuff to the current byte buffer (rBuffer) based on
 * the filters loaded into the RarVM and writes out to wBuffer.
 */
function RarWriteBuf() {
  var writeSize = (rBuffer.ptr & MAXWINMASK);

  for (var i = 0; i < PrgStack.length; ++i) {
    var flt = PrgStack[i];
    if (flt == null) {
      continue;
    }

    if (flt.NextWindow) {
      flt.NextWindow = false;
      continue;
    }

    var blockStart = flt.BlockStart;
    var blockLength = flt.BlockLength;

    // WrittenBorder = wBuffer.ptr
    if (((blockStart - wBuffer.ptr) & MAXWINMASK) < writeSize) {
      if (wBuffer.ptr != blockStart) {
        // Copy blockStart bytes from rBuffer into wBuffer.
        RarWriteArea(wBuffer.ptr, blockStart);
        writeSize = (rBuffer.ptr - wBuffer.ptr) & MAXWINMASK;
      }
      if (blockLength <= writeSize) {
        var blockEnd = (blockStart + blockLength) & MAXWINMASK;
        if (blockStart < blockEnd || blockEnd == 0) {
          VM.setMemory(0, rBuffer.data.subarray(blockStart, blockStart + blockLength), blockLength);
        } else {
          var firstPartLength = MAXWINSIZE - blockStart;
          VM.setMemory(0, rBuffer.data.subarray(blockStart, blockStart + firstPartLength), firstPartLength);
          VM.setMemory(firstPartLength, rBuffer.data, blockEnd);
        }

        var parentPrg = Filters[flt.ParentFilter].Prg;
        var prg = flt.Prg;

        if (parentPrg.GlobalData.length > VM_FIXEDGLOBALSIZE) {
          // Copy global data from previous script execution if any.
          prg.GlobalData = new Uint8Array(parentPrg.GlobalData);
        }

        RarExecuteCode(prg);

        if (prg.GlobalData.length > VM_FIXEDGLOBALSIZE) {
          // Save global data for next script execution.
          var globalDataLen = prg.GlobalData.length;
          if (parentPrg.GlobalData.length < globalDataLen) {
            parentPrg.GlobalData = new Uint8Array(globalDataLen);
          }
          parentPrg.GlobalData.set(
              this.mem_.subarray(VM_FIXEDGLOBALSIZE, VM_FIXEDGLOBALSIZE + globalDataLen),
              VM_FIXEDGLOBALSIZE);
        } else {
          parentPrg.GlobalData = new Uint8Array(0);
        }

        var filteredData = prg.FilteredData;

        PrgStack[i] = null;
        while (i + 1 < PrgStack.length) {
          var nextFilter = PrgStack[i + 1];
          if (nextFilter == null || nextFilter.BlockStart != blockStart ||
              nextFilter.BlockLength != filteredData.length || nextFilter.NextWindow) {
            break;
          }

          // Apply several filters to same data block.

          VM.setMemory(0, filteredData, filteredData.length);

          var parentPrg = Filters[nextFilter.ParentFilter].Prg;
          var nextPrg = nextFilter.Prg;

          var globalDataLen = parentPrg.GlobalData.length;
          if (globalDataLen > VM_FIXEDGLOBALSIZE) {
            // Copy global data from previous script execution if any.
            nextPrg.GlobalData = new Uint8Array(globalDataLen);
            nextPrg.GlobalData.set(parentPrg.GlobalData.subarray(VM_FIXEDGLOBALSIZE, VM_FIXEDGLOBALSIZE + globalDataLen), VM_FIXEDGLOBALSIZE);
          }

          RarExecuteCode(nextPrg);

          if (nextPrg.GlobalData.length > VM_GLOBALMEMSIZE) {
            // Save global data for next script execution.
            var globalDataLen = nextPrg.GlobalData.length;
            if (parentPrg.GlobalData.length < globalDataLen) {
              parentPrg.GlobalData = new Uint8Array(globalDataLen);
            }
            parentPrg.GlobalData.set(
                this.mem_.subarray(VM_FIXEDGLOBALSIZE, VM_FIXEDGLOBALSIZE + globalDataLen),
                VM_FIXEDGLOBALSIZE);
          } else {
            parentPrg.GlobalData = new Uint8Array(0);
          }

          filteredData = nextPrg.FilteredData;
          i++;
          PrgStack[i] = null;
        } // while (i + 1 < PrgStack.length)

        for (var j = 0; j < filteredData.length; ++j) {
          wBuffer.insertByte(filteredData[j]);
        }
        writeSize = (rBuffer.ptr - wBuffer.ptr) & MAXWINMASK;
      } // if (blockLength <= writeSize)
      else {
        for (var j = i; j < PrgStack.length; ++j) {
          var flt = PrgStack[j];
          if (flt != null && flt.NextWindow) {
            flt.NextWindow = false;
          }
        }
        //WrPtr=WrittenBorder;
        return;
      }
    } // if (((blockStart - wBuffer.ptr) & MAXWINMASK) < writeSize)
  } // for (var i = 0; i < PrgStack.length; ++i)

  // Write any remaining bytes from rBuffer to wBuffer;
  RarWriteArea(wBuffer.ptr, rBuffer.ptr);

  // Now that the filtered buffer has been written, swap it back to rBuffer.
  rBuffer = wBuffer;
}

/**
 * Copy bytes from rBuffer to wBuffer.
 * @param {number} startPtr The starting point to copy from rBuffer.
 * @param {number} endPtr The ending point to copy from rBuffer.
 */
function RarWriteArea(startPtr, endPtr) {
  if (endPtr < startPtr) {
    console.error('endPtr < startPtr, endPtr=' + endPtr + ', startPtr=' + startPtr);
//    RarWriteData(startPtr, -(int)StartPtr & MAXWINMASK);
//    RarWriteData(0, endPtr);
    return;
  } else if (startPtr < endPtr) {
    RarWriteData(startPtr, endPtr - startPtr);
  }
}

/**
 * Writes bytes into wBuffer from rBuffer.
 * @param {number} offset The starting point to copy bytes from rBuffer.
 * @param {number} numBytes The number of bytes to copy.
 */
function RarWriteData(offset, numBytes) {
  if (wBuffer.ptr >= rBuffer.data.length) {
    return;
  }
  var leftToWrite = rBuffer.data.length - wBuffer.ptr;
  if (numBytes > leftToWrite) {
    numBytes = leftToWrite;
  }
  for (var i = 0; i < numBytes; ++i) {
    wBuffer.insertByte(rBuffer.data[offset + i]);
  }
}

/**
 * @param {VM_PreparedProgram} prg
 */
function RarExecuteCode(prg)
{
  if (prg.GlobalData.length > 0) {
    var writtenFileSize = wBuffer.ptr;
    prg.InitR[6] = writtenFileSize;
    VM.setLowEndianValue(prg.GlobalData, writtenFileSize, 0x24);
    VM.setLowEndianValue(prg.GlobalData, (writtenFileSize >>> 32) >> 0, 0x28);
    VM.execute(prg);
  }
}

function RarReadEndOfBlock(bstream) {
  RarUpdateProgress();

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

function RarInsertLastMatch(length, distance) {
  lastDist = distance;
  lastLength = length;
}

function RarInsertOldDist(distance) {
  rOldDist.splice(3,1);
  rOldDist.splice(0,0,distance);
}

/**
 * Copies len bytes from distance bytes ago in the buffer to the end of the
 * current byte buffer.
 * @param {number} length How many bytes to copy.
 * @param {number} distance How far back in the buffer from the current write
 *     pointer to start copying from.
 */
function RarCopyString(len, distance) {
  var srcPtr = rBuffer.ptr - distance;
  if (srcPtr < 0) {
    var l = rOldBuffers.length;
    while (srcPtr < 0) {
      srcPtr = rOldBuffers[--l].data.length + srcPtr;
    }
    // TODO: lets hope that it never needs to read beyond file boundaries
    while (len--) {
      rBuffer.insertByte(rOldBuffers[l].data[srcPtr++]);
    }
  }
  if (len > distance) {
    while (len--) {
      rBuffer.insertByte(rBuffer.data[srcPtr++]);
    }
  } else {
    rBuffer.insertBytes(rBuffer.data.subarray(srcPtr, srcPtr + len));
  }
}

/**
 * @param {RarLocalFile} v
 */
function unpack(v) {
  // TODO: implement what happens when unpVer is < 15
  var Ver = v.header.unpVer <= 15 ? 15 : v.header.unpVer;
  var Solid = v.header.LHD_SOLID;
  var bstream = new bitjs.io.BitStream(v.fileData.buffer, true /* rtl */, v.fileData.byteOffset, v.fileData.byteLength );
  
  rBuffer = new bitjs.io.ByteBuffer(v.header.unpackedSize);

  info("Unpacking " + v.filename + " RAR v" + Ver);
    
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
      wBuffer = new bitjs.io.ByteBuffer(rBuffer.data.length);
      Unpack29(bstream, Solid);
      break;
  } // switch(method)
  
  rOldBuffers.push(rBuffer);
  // TODO: clear these old buffers when there's over 4MB of history
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
      } while (localFile.isValid);
      totalFilesInArchive = localFiles.length;
      
      // now we have all information but things are unpacked
      // TODO: unpack
      localFiles = localFiles.sort(function(a,b) {
        var aname = a.filename.toLowerCase();
        var bname = b.filename.toLowerCase();
        return aname > bname ? 1 : -1;
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
