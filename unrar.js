
// =======================
// NOTES on the RAR format
// http://kthoom.googlecode.com/hg/docs/unrar.html

// Volume Types
var MARK_HEAD			= 0x72,
	MAIN_HEAD			= 0x73,
	FILE_HEAD			= 0x74,
	COMM_HEAD			= 0x75,
	AV_HEAD				= 0x76,
	SUB_HEAD			= 0x77,
	PROTECT_HEAD		= 0x78,
	SIGN_HEAD			= 0x79,
	NEWSUB_HEAD			= 0x7a,
	ENDARC_HEAD			= 0x7b;

// bstream is a bit stream
function RarVolumeHeader(bstream, bDebug) {

	this.debug = bDebug;

	// byte 1,2
	this.crc = bstream.readBits(16);
	if (bDebug)
		postMessage("  crc=" + this.crc);

	// byte 3
	this.headType = bstream.readBits(8);
	if (bDebug)
		postMessage("  headType=" + this.headType);

	// Get flags
	// bytes 4,5
	this.flags = {};
	this.flags.value = bstream.peekBits(16);
	if (bDebug)
		postMessage("  flags=" + twoByteValueToHexString(this.flags.value));
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
		if (bDebug)
			postMessage("  LHD_SPLIT_BEFORE = " + this.flags.LHD_SPLIT_BEFORE);
		break;
	default:
		bstream.readBits(16);
	}
	
	// byte 6,7
	this.headSize = bstream.readBits(16);
	if (bDebug)
		postMessage("  headSize=" + this.headSize);
	
	switch (this.headType) {
	case MAIN_HEAD:
		this.highPosAv = bstream.readBits(16);
		this.posAv = bstream.readBits(32);
		if (this.flags.MHD_ENCRYPTVER)
			this.encryptVer = bstream.readBits(8);
		if (this.debug)
			postMessage("Found MAIN_HEAD with highPosAv=" + this.highPosAv + ", posAv=" + this.posAv);
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
			postMessage("Warning: Reading in LHD_LARGE 64-bit size values");
			this.HighPackSize = bstream.readBits(32);
			this.HighUnpSize = bstream.readBits(32);
		}
		
		// read in filename
		this.filename = bstream.readBytes(this.nameSize);
		
		if (this.flags.LHD_SALT) {
			postMessage("Warning: Reading in 64-bit salt value");
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
			postMessage("Found a LHD_COMMENT");
		}
		
//		if (bDebug)
//			postMessage("BytePtr = " + bstream.bytePtr);
		
		if (this.debug)
			postMessage("Found FILE_HEAD with packSize=" + this.packSize + ", unpackedSize= " + this.unpackedSize + ", hostOS=" + this.hostOS + ", unpVer=" + this.unpVer + ", method=" + this.method + ", filename=" + this.filename);
	
		break;
	default:
		if (this.debug)
			postMessage("Found a header of type 0x" + byteValueToHexString(this.headType));
		// skip the rest of the header bytes (for now)
		bstream.readBytes( this.headSize - 7 );
		break;
	}

}

var BLOCK_LZ = 0,
	BLOCK_PPM = 1;

var rLDecode = [0,1,2,3,4,5,6,7,8,10,12,14,16,20,24,28,32,40,48,56,64,80,96,112,128,160,192,224],
	rLBits = [0,0,0,0,0,0,0,0,1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4,  4,  5,  5,  5,  5],
	rDBitLengthCounts = [4,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,14,0,12],
	rSDDecode = [0,4,8,16,32,64,128,192],
	rSDBits = [2,2,3, 4, 5, 6,  6,  6],
	rDDecode = null,
	rDBits = null;

var rNC = 299,
	rDC = 60,
	rLDC = 17,
	rRC = 28,
	rBC = 20,
	rHUFF_TABLE_SIZE = (rNC+rDC+rRC+rLDC);

var UnpBlockType = BLOCK_LZ;

// read in Huffman tables for RAR
function RarReadTables(bstream) {
	var BitLength = new Array(rBC),
		Table = new Array(rHUFF_TABLE_SIZE);

	// before we start anything we need to get byte-aligned
	bstream.readBits( (8 - bstream.BitPtr) & 0x7 );
	
	var isPPM = bstream.peekBits(1);
	if (isPPM) {
		UnpBlockType = BLOCK_PPM;
		// TODO: implement PPM stuff
		postMessage("Error!  PPM not implemented yet");
		return;
	}
	else {
		bstream.readBits(1);
		
		var keepOldTable = bstream.readBits(1);
		if (!keepOldTable) {
			// TODO: clear old table if !keepOldTable
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
		var LenCount = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
			TmpPos = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
			DecodeLen = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
			DecodePos = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
			DecodeNum = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
			N = 0,
			M = 0;
			
		for (var i = 0; i < rBC; ++i) { postMessage("BitLength[" + i + "] is " + BitLength[i]); }
		
		// count number of codes for each length
		for (I = 0; I < rBC; ++I)
			LenCount[BitLength[I] & 0xF]++;
		LenCount[0] = 0;
		
		for (var i = 0; i < 16; ++i) { postMessage("Count of length " + i + " is " + LenCount[i]); }
		
		for (I = 1; I < 16; ++I) {
			N = 2 * (N+LenCount[I]);
			M = (N << (15-I));
			if (M > 0xFFFF)
				M = 0xFFFF;
			DecodeLen[I] = M;
			DecodePos[I] = DecodePos[I-1] + LenCount[I-1];
			TmpPos[I] = DecodePos[I];
			postMessage(" I=" + I + ", LenCount[I]=" + LenCount[I] + ", N=" + N + ", M=" + M);
		}
		
		for (I = 0; I < rBC; ++I)
			if (BitLength[I] != 0)
				DecodeNum[ TmpPos[ BitLength[I] & 0xF ]++] = I;

		for (I = 0; I < rBC; ++I) {
			postMessage("Code[" + I + "] has Len=" + DecodeLen[I] + ", Pos=" + DecodePos[I] + ", Num=" + DecodeNum[I]);
		}
	}
}

// TODO: implement
function Unpack15(bstream, Solid) {
	postMessage("ERROR!  RAR 1.5 compression not supported");
}

function Unpack20(bstream, Solid) {
	postMessage("ERROR!  RAR 2.0 compression not supported");
}

function Unpack29(bstream, Solid) {
	// lazy initialize rDDecode and rDBits
	if (rDDecode == null) {
		rDDecode = new Array(rDC);
		rDBits = new Array(rDC);
		var Dist=0,BitLength=0,Slot=0;
		for (var I = 0; I < rDBitLengthCounts.length / 4; I++,BitLength++) {
			for (var J = 0; J < rDBitLengthCounts[I]; J++,Slot++,Dist+=(1<<BitLength)) {
				rDDecode[Slot]=Dist;
				rDBits[Slot]=BitLength;
			}
		}
	}
	
	// initialize data

	// read in Huffman tables
	RarReadTables(bstream);

	postMessage("ERROR!  RAR 2.9 compression not yet supported");
}

/** Adapt this:

void Unpack::Unpack29(bool Solid)
{
  static unsigned char LDecode[]={0,1,2,3,4,5,6,7,8,10,12,14,16,20,24,28,32,40,48,56,64,80,96,112,128,160,192,224};
  static unsigned char LBits[]=  {0,0,0,0,0,0,0,0,1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4,  4,  5,  5,  5,  5};
  static int DDecode[DC];
  static byte DBits[DC];
  static int DBitLengthCounts[]= {4,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,14,0,12};
  static unsigned char SDDecode[]={0,4,8,16,32,64,128,192};
  static unsigned char SDBits[]=  {2,2,3, 4, 5, 6,  6,  6};
  unsigned int Bits;

  if (DDecode[1]==0)
  {
    int Dist=0,BitLength=0,Slot=0;
    for (int I=0;I<sizeof(DBitLengthCounts)/sizeof(DBitLengthCounts[0]);I++,BitLength++)
      for (int J=0;J<DBitLengthCounts[I];J++,Slot++,Dist+=(1<<BitLength))
      {
        DDecode[Slot]=Dist;
        DBits[Slot]=BitLength;
      }
  }

  FileExtracted=true;

  if (!Suspended)
  {
    UnpInitData(Solid);
    if (!UnpReadBuf())
      return;
    if ((!Solid || !TablesRead) && !ReadTables())
      return;
  }

  while (true)
  {
    UnpPtr&=MAXWINMASK;

    if (InAddr>ReadBorder)
    {
      if (!UnpReadBuf())
        break;
    }
    if (((WrPtr-UnpPtr) & MAXWINMASK)<260 && WrPtr!=UnpPtr)
    {
      UnpWriteBuf();
      if (WrittenFileSize>DestUnpSize)
        return;
      if (Suspended)
      {
        FileExtracted=false;
        return;
      }
    }
    if (UnpBlockType==BLOCK_PPM)
    {
      // Here speed is critical, so we do not use SafePPMDecodeChar,
      // because sometimes even the inline function can introduce
      // some additional penalty.
      int Ch=PPM.DecodeChar();
      if (Ch==-1)              // Corrupt PPM data found.
      {
        PPM.CleanUp();         // Reset possibly corrupt PPM data structures.
        UnpBlockType=BLOCK_LZ; // Set faster and more fail proof LZ mode.
        break;
      }
      if (Ch==PPMEscChar)
      {
        int NextCh=SafePPMDecodeChar();
        if (NextCh==0)  // End of PPM encoding.
        {
          if (!ReadTables())
            break;
          continue;
        }
        if (NextCh==-1) // Corrupt PPM data found.
          break;
        if (NextCh==2)  // End of file in PPM mode..
          break;
        if (NextCh==3)  // Read VM code.
        {
          if (!ReadVMCodePPM())
            break;
          continue;
        }
        if (NextCh==4) // LZ inside of PPM.
        {
          unsigned int Distance=0,Length;
          bool Failed=false;
          for (int I=0;I<4 && !Failed;I++)
          {
            int Ch=SafePPMDecodeChar();
            if (Ch==-1)
              Failed=true;
            else
              if (I==3)
                Length=(byte)Ch;
              else
                Distance=(Distance<<8)+(byte)Ch;
          }
          if (Failed)
            break;

          CopyString(Length+32,Distance+2);
          continue;
        }
        if (NextCh==5) // One byte distance match (RLE) inside of PPM.
        {
          int Length=SafePPMDecodeChar();
          if (Length==-1)
            break;
          CopyString(Length+4,1);
          continue;
        }
        // If we are here, NextCh must be 1, what means that current byte
        // is equal to our 'escape' byte, so we just store it to Window.
      }
      Window[UnpPtr++]=Ch;
      continue;
    }

    int Number=DecodeNumber((struct Decode *)&LD);
    if (Number<256)
    {
      Window[UnpPtr++]=(byte)Number;
      continue;
    }
    if (Number>=271)
    {
      int Length=LDecode[Number-=271]+3;
      if ((Bits=LBits[Number])>0)
      {
        Length+=getbits()>>(16-Bits);
        addbits(Bits);
      }

      int DistNumber=DecodeNumber((struct Decode *)&DD);
      unsigned int Distance=DDecode[DistNumber]+1;
      if ((Bits=DBits[DistNumber])>0)
      {
        if (DistNumber>9)
        {
          if (Bits>4)
          {
            Distance+=((getbits()>>(20-Bits))<<4);
            addbits(Bits-4);
          }
          if (LowDistRepCount>0)
          {
            LowDistRepCount--;
            Distance+=PrevLowDist;
          }
          else
          {
            int LowDist=DecodeNumber((struct Decode *)&LDD);
            if (LowDist==16)
            {
              LowDistRepCount=LOW_DIST_REP_COUNT-1;
              Distance+=PrevLowDist;
            }
            else
            {
              Distance+=LowDist;
              PrevLowDist=LowDist;
            }
          }
        }
        else
        {
          Distance+=getbits()>>(16-Bits);
          addbits(Bits);
        }
      }

      if (Distance>=0x2000)
      {
        Length++;
        if (Distance>=0x40000L)
          Length++;
      }

      InsertOldDist(Distance);
      InsertLastMatch(Length,Distance);
      CopyString(Length,Distance);
      continue;
    }
    if (Number==256)
    {
      if (!ReadEndOfBlock())
        break;
      continue;
    }
    if (Number==257)
    {
      if (!ReadVMCode())
        break;
      continue;
    }
    if (Number==258)
    {
      if (LastLength!=0)
        CopyString(LastLength,LastDist);
      continue;
    }
    if (Number<263)
    {
      int DistNum=Number-259;
      unsigned int Distance=OldDist[DistNum];
      for (int I=DistNum;I>0;I--)
        OldDist[I]=OldDist[I-1];
      OldDist[0]=Distance;

      int LengthNumber=DecodeNumber((struct Decode *)&RD);
      int Length=LDecode[LengthNumber]+2;
      if ((Bits=LBits[LengthNumber])>0)
      {
        Length+=getbits()>>(16-Bits);
        addbits(Bits);
      }
      InsertLastMatch(Length,Distance);
      CopyString(Length,Distance);
      continue;
    }
    if (Number<272)
    {
      unsigned int Distance=SDDecode[Number-=263]+1;
      if ((Bits=SDBits[Number])>0)
      {
        Distance+=getbits()>>(16-Bits);
        addbits(Bits);
      }
      InsertOldDist(Distance);
      InsertLastMatch(2,Distance);
      CopyString(2,Distance);
      continue;
    }
  }
  UnpWriteBuf();
}

*/

// v must be a valid RarVolume
function unpack(v) {
	// TODO: implement what happens when unpVer is < 15
	var Ver = v.header.unpVer <= 15 ? 15 : v.header.unpVer,
		Solid = v.header.LHD_SOLID,
		bstream = new OldBitStream(v.fileData);
	
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
}

// bstream is a bit stream
function RarLocalFile(bstream, bDebug) {
	
	this.header = new RarVolumeHeader(bstream, bDebug);
	this.filename = this.header.filename;
	
	if (this.header.headType != FILE_HEAD) {
		this.isValid = false;
		progress.isValid = false;
		postMessage("Error! RAR Volume did not include a FILE_HEAD header");
	}
	else {
		// read in the compressed data
		this.fileData = null;
		if (this.header.packSize > 0) {
			this.fileData = bstream.readBytes(this.header.packSize);
			this.isValid = true;
		}
	}
}

RarLocalFile.prototype.unrar = function() {
	if (!this.header.flags.LHD_SPLIT_BEFORE) {
		// unstore file
		if (this.header.method == 0x30) {
			this.isValid = true;
			progress.currentFileBytesUnzipped += this.fileData.length;
			progress.totalBytesUnzipped += this.fileData.length;
		}
		else {
			unpack(this);
		}
	}
}

function unrar(bstr, bDebug) {
	var bstream = new OldBitStream(bstr);

	var header = new RarVolumeHeader(bstream, bDebug);
	if (header.crc == 0x6152 && 
		header.headType == 0x72 && 
		header.flags.value == 0x1A21 &&
		header.headSize == 7) 
	{
		if (bDebug)	
			postMessage("Found RAR signature");

		var mhead = new RarVolumeHeader(bstream, bDebug);
		if (mhead.headType != MAIN_HEAD) {
			progress.isValid = false;
			postMessage("Error! RAR did not include a MAIN_HEAD header");
		}
		else {
			var localFiles = [],
				localFile = null;
			do {
				localFile = new RarLocalFile(bstream, bDebug);
				if (bDebug)
					postMessage("RAR localFile isValid=" + localFile.isValid + ", volume packSize=" + localFile.header.packSize);
				if (localFile && localFile.isValid && localFile.header.packSize > 0) {
					progress.totalSizeInBytes += localFile.header.unpackedSize;
					progress.isValid = true;
					localFiles.push(localFile);
				}
			} while( localFile.isValid );

			progress.totalNumFilesInZip = localFiles.length;
			
			// now we have all information but things are unpacked
			// TODO: unpack
			for (var i = 0; i < localFiles.length; ++i) {
				var localfile = localFiles[i];
				
				// update progress 
				progress.currentFilename = localfile.header.filename;
				progress.currentFileBytesUnzipped = 0;
				
				// actually do the unzipping
				localfile.unrar();
				
				if (localfile.isValid) {
					progress.localFiles.push(localfile);
					postMessage(progress);
					progress.localFiles = [];
				}
			}
			
			progress.isDone = true;
			postMessage(progress);
		}
	}
	else {
		postMessage("Unknown file!");
	}
}

