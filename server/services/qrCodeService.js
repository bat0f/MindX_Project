const VERSION = 6;
const SIZE = 17 + VERSION * 4;
const ALIGNMENT_POSITIONS = [6, 34];
const FORMAT_MASK = 0x5412;
const TYPE_INFO_POLY = 0x537;
const VERSION_INFO_POLY = 0x1f25;
const DATA_CODEWORDS = 136;
const PAD_BYTES = [0xec, 0x11];
const BLOCKS = [
  { count: 2, data: 68, total: 86 },
];

class QrCodeService {
  constructor() {
    this.exp = new Array(512);
    this.log = new Array(256);

    let value = 1;
    for (let index = 0; index < 255; index += 1) {
      this.exp[index] = value;
      this.log[value] = index;
      value <<= 1;
      if (value & 0x100) {
        value ^= 0x11d;
      }
    }

    for (let index = 255; index < 512; index += 1) {
      this.exp[index] = this.exp[index - 255];
    }
  }

  createTotpDataUrl(text) {
    const matrix = this.createMatrix(String(text || ''));
    const quietZone = 4;
    const moduleSize = 6;
    const imageSize = (SIZE + quietZone * 2) * moduleSize;
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize}" height="${imageSize}" viewBox="0 0 ${imageSize} ${imageSize}" shape-rendering="crispEdges">`,
      `<rect width="100%" height="100%" fill="#fff"/>`,
    ];

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (matrix[row][col]) {
          parts.push(
            `<rect x="${(col + quietZone) * moduleSize}" y="${(row + quietZone) * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="#111"/>`
          );
        }
      }
    }

    parts.push('</svg>');
    return `data:image/svg+xml;base64,${Buffer.from(parts.join('')).toString('base64')}`;
  }

  createMatrix(text) {
    const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));

    this.drawFunctionPatterns(modules, reserved);
    const codewords = this.createCodewords(text);
    this.placeData(modules, reserved, codewords);
    this.drawFormatInfo(modules, reserved);
    this.drawVersionInfo(modules, reserved);

    return modules.map((row) => row.map(Boolean));
  }

  createCodewords(text) {
    const bytes = Array.from(Buffer.from(text, 'utf8'));
    const charCountBits = VERSION < 10 ? 8 : 16;
    const maxByteLength = Math.floor((DATA_CODEWORDS * 8 - 4 - charCountBits) / 8);

    if (bytes.length > maxByteLength) {
      throw new Error('QR-код не помещает данные настройки TOTP.');
    }

    const bits = [];
    this.appendBits(bits, 0b0100, 4);
    this.appendBits(bits, bytes.length, charCountBits);
    for (const byte of bytes) {
      this.appendBits(bits, byte, 8);
    }

    const remainingBits = DATA_CODEWORDS * 8 - bits.length;
    this.appendBits(bits, 0, Math.min(4, remainingBits));
    while (bits.length % 8 !== 0) {
      bits.push(0);
    }

    const data = [];
    for (let index = 0; index < bits.length; index += 8) {
      data.push(parseInt(bits.slice(index, index + 8).join(''), 2));
    }

    let padIndex = 0;
    while (data.length < DATA_CODEWORDS) {
      data.push(PAD_BYTES[padIndex % PAD_BYTES.length]);
      padIndex += 1;
    }

    const blocks = [];
    let offset = 0;
    for (const group of BLOCKS) {
      for (let index = 0; index < group.count; index += 1) {
        const dataPart = data.slice(offset, offset + group.data);
        const ecc = this.createEcc(dataPart, group.total - group.data);
        blocks.push({ data: dataPart, ecc });
        offset += group.data;
      }
    }

    const result = [];
    const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
    for (let index = 0; index < maxDataLength; index += 1) {
      for (const block of blocks) {
        if (index < block.data.length) {
          result.push(block.data[index]);
        }
      }
    }

    const eccLength = blocks[0].ecc.length;
    for (let index = 0; index < eccLength; index += 1) {
      for (const block of blocks) {
        result.push(block.ecc[index]);
      }
    }

    return result;
  }

  appendBits(bits, value, length) {
    for (let shift = length - 1; shift >= 0; shift -= 1) {
      bits.push((value >>> shift) & 1);
    }
  }

  createEcc(data, degree) {
    const generator = this.createGenerator(degree);
    const result = new Array(degree).fill(0);

    for (const byte of data) {
      const factor = byte ^ result.shift();
      result.push(0);

      if (factor !== 0) {
        for (let index = 0; index < degree; index += 1) {
          result[index] ^= this.multiply(generator[index], factor);
        }
      }
    }

    return result;
  }

  createGenerator(degree) {
    let result = [1];
    for (let index = 0; index < degree; index += 1) {
      const next = new Array(result.length + 1).fill(0);
      for (let offset = 0; offset < result.length; offset += 1) {
        next[offset] ^= result[offset];
        next[offset + 1] ^= this.multiply(result[offset], this.exp[index]);
      }
      result = next;
    }
    return result.slice(1);
  }

  multiply(left, right) {
    if (left === 0 || right === 0) {
      return 0;
    }
    return this.exp[this.log[left] + this.log[right]];
  }

  drawFunctionPatterns(modules, reserved) {
    this.drawFinder(modules, reserved, 0, 0);
    this.drawFinder(modules, reserved, SIZE - 7, 0);
    this.drawFinder(modules, reserved, 0, SIZE - 7);

    for (let index = 8; index < SIZE - 8; index += 1) {
      this.setFunctionModule(modules, reserved, 6, index, index % 2 === 0);
      this.setFunctionModule(modules, reserved, index, 6, index % 2 === 0);
    }

    for (const row of ALIGNMENT_POSITIONS) {
      for (const col of ALIGNMENT_POSITIONS) {
        if (reserved[row][col]) {
          continue;
        }
        this.drawAlignment(modules, reserved, row, col);
      }
    }

    this.setFunctionModule(modules, reserved, SIZE - 8, 8, true);
    this.reserveFormatAreas(reserved);
    if (VERSION >= 7) {
      this.reserveVersionAreas(reserved);
    }
  }

  drawFinder(modules, reserved, left, top) {
    for (let row = -1; row <= 7; row += 1) {
      for (let col = -1; col <= 7; col += 1) {
        const y = top + row;
        const x = left + col;
        if (y < 0 || y >= SIZE || x < 0 || x >= SIZE) {
          continue;
        }

        const dark =
          row >= 0 &&
          row <= 6 &&
          col >= 0 &&
          col <= 6 &&
          (row === 0 || row === 6 || col === 0 || col === 6 || (row >= 2 && row <= 4 && col >= 2 && col <= 4));
        this.setFunctionModule(modules, reserved, y, x, dark);
      }
    }
  }

  drawAlignment(modules, reserved, centerRow, centerCol) {
    for (let row = -2; row <= 2; row += 1) {
      for (let col = -2; col <= 2; col += 1) {
        const dark = Math.max(Math.abs(row), Math.abs(col)) !== 1;
        this.setFunctionModule(modules, reserved, centerRow + row, centerCol + col, dark);
      }
    }
  }

  reserveFormatAreas(reserved) {
    for (let index = 0; index < 9; index += 1) {
      if (index !== 6) {
        reserved[8][index] = true;
        reserved[index][8] = true;
      }
    }

    for (let index = 0; index < 8; index += 1) {
      reserved[8][SIZE - 1 - index] = true;
      reserved[SIZE - 1 - index][8] = true;
    }
  }

  reserveVersionAreas(reserved) {
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        reserved[row][SIZE - 11 + col] = true;
        reserved[SIZE - 11 + col][row] = true;
      }
    }
  }

  setFunctionModule(modules, reserved, row, col, dark) {
    modules[row][col] = Boolean(dark);
    reserved[row][col] = true;
  }

  placeData(modules, reserved, codewords) {
    const bits = [];
    for (const codeword of codewords) {
      this.appendBits(bits, codeword, 8);
    }

    let bitIndex = 0;
    let upward = true;

    for (let right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right -= 1;
      }

      for (let vertical = 0; vertical < SIZE; vertical += 1) {
        const row = upward ? SIZE - 1 - vertical : vertical;
        for (let offset = 0; offset < 2; offset += 1) {
          const col = right - offset;
          if (reserved[row][col]) {
            continue;
          }

          const mask = (row + col) % 2 === 0;
          modules[row][col] = Boolean((bits[bitIndex] || 0) ^ (mask ? 1 : 0));
          bitIndex += 1;
        }
      }

      upward = !upward;
    }
  }

  drawFormatInfo(modules, reserved) {
    const bits = this.createBchBits(0b01 << 3, TYPE_INFO_POLY, 10) ^ FORMAT_MASK;

    for (let index = 0; index < 15; index += 1) {
      const dark = Boolean((bits >>> index) & 1);

      if (index < 6) {
        this.setFunctionModule(modules, reserved, index, 8, dark);
      } else if (index < 8) {
        this.setFunctionModule(modules, reserved, index + 1, 8, dark);
      } else {
        this.setFunctionModule(modules, reserved, SIZE - 15 + index, 8, dark);
      }

      if (index < 8) {
        this.setFunctionModule(modules, reserved, 8, SIZE - index - 1, dark);
      } else if (index < 9) {
        this.setFunctionModule(modules, reserved, 8, 15 - index, dark);
      } else {
        this.setFunctionModule(modules, reserved, 8, 14 - index, dark);
      }
    }

    this.setFunctionModule(modules, reserved, SIZE - 8, 8, true);
  }

  drawVersionInfo(modules, reserved) {
    const bits = this.createBchBits(VERSION, VERSION_INFO_POLY, 12);

    if (VERSION < 7) {
      return;
    }

    for (let index = 0; index < 18; index += 1) {
      const dark = Boolean((bits >>> index) & 1);
      const row = Math.floor(index / 3);
      const col = index % 3;
      this.setFunctionModule(modules, reserved, row, SIZE - 11 + col, dark);
      this.setFunctionModule(modules, reserved, SIZE - 11 + col, row, dark);
    }
  }

  createBchBits(value, poly, degree) {
    let bits = value << degree;
    const polyDegree = this.getBitLength(poly) - 1;
    while (this.getBitLength(bits) - 1 >= polyDegree) {
      bits ^= poly << (this.getBitLength(bits) - this.getBitLength(poly));
    }
    return (value << degree) | bits;
  }

  getBitLength(value) {
    let length = 0;
    while (value !== 0) {
      length += 1;
      value >>>= 1;
    }
    return length;
  }
}

module.exports = new QrCodeService();
