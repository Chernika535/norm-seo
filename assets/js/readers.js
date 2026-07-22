/* =============================================================
   NormSEO — чтение файлов: txt/md/fb2/html/srt/vtt, DOCX, PDF.
   Всё локально, без внешних библиотек.
   Инфлейт — компактный порт tiny-inflate (tinf), MIT
   (Joergen Ibsen / Devon Govett).
   ============================================================= */

window.NS_READERS = (function () {
  'use strict';

  /* ---------------- tiny-inflate (raw DEFLATE) ---------------- */
  function Tree() { this.table = new Uint16Array(16); this.trans = new Uint16Array(288); }
  function Data(src, dest) {
    this.s = src; this.i = 0; this.t = 0; this.bitcount = 0;
    this.dest = dest; this.destLen = 0;
    this.ltree = new Tree(); this.dtree = new Tree();
  }
  var sltree = new Tree(), sdtree = new Tree();
  var length_bits = new Uint8Array(30), length_base = new Uint16Array(30);
  var dist_bits = new Uint8Array(30), dist_base = new Uint16Array(30);
  var clcidx = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var code_tree = new Tree(), lengths = new Uint8Array(288 + 32);

  function build_bits_base(bits, base, delta, first) {
    var i, sum;
    for (i = 0; i < delta; ++i) bits[i] = 0;
    for (i = 0; i < 30 - delta; ++i) bits[i + delta] = (i / delta) | 0;
    for (sum = first, i = 0; i < 30; ++i) { base[i] = sum; sum += 1 << bits[i]; }
  }
  function build_fixed_trees(lt, dt) {
    var i;
    for (i = 0; i < 7; ++i) lt.table[i] = 0;
    lt.table[7] = 24; lt.table[8] = 152; lt.table[9] = 112;
    for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
    for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
    for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
    for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;
    for (i = 0; i < 5; ++i) dt.table[i] = 0;
    dt.table[5] = 32;
    for (i = 0; i < 32; ++i) dt.trans[i] = i;
  }
  function build_tree(t, lens, off, num) {
    var i, offs = new Uint16Array(16), sum = 0;
    for (i = 0; i < 16; ++i) t.table[i] = 0;
    for (i = 0; i < num; ++i) t.table[lens[off + i]]++;
    t.table[0] = 0;
    for (i = 0; i < 16; ++i) { offs[i] = sum; sum += t.table[i]; }
    for (i = 0; i < num; ++i) if (lens[off + i]) t.trans[offs[lens[off + i]]++] = i;
  }
  function getbit(d) {
    if (!d.bitcount--) { d.t = d.s[d.i++]; d.bitcount = 7; }
    var bit = d.t & 1; d.t >>>= 1; return bit;
  }
  function read_bits(d, num, base) {
    if (!num) return base;
    while (d.bitcount < 24) { d.t |= d.s[d.i++] << d.bitcount; d.bitcount += 8; }
    var val = d.t & (0xffff >>> (16 - num));
    d.t >>>= num; d.bitcount -= num;
    return val + base;
  }
  function decode_symbol(d, t) {
    while (d.bitcount < 24) { d.t |= d.s[d.i++] << d.bitcount; d.bitcount += 8; }
    var sum = 0, cur = 0, len = 0, tag = d.t;
    do {
      cur = 2 * cur + (tag & 1); tag >>>= 1; ++len;
      sum += t.table[len]; cur -= t.table[len];
    } while (cur >= 0);
    d.t = tag; d.bitcount -= len;
    return t.trans[sum + cur];
  }
  function decode_trees(d, lt, dt) {
    var hlit, hdist, hclen, i, num, length;
    hlit = read_bits(d, 5, 257);
    hdist = read_bits(d, 5, 1);
    hclen = read_bits(d, 4, 4);
    for (i = 0; i < 19; ++i) lengths[i] = 0;
    for (i = 0; i < hclen; ++i) lengths[clcidx[i]] = read_bits(d, 3, 0);
    build_tree(code_tree, lengths, 0, 19);
    for (num = 0; num < hlit + hdist;) {
      var sym = decode_symbol(d, code_tree);
      switch (sym) {
        case 16: { var prev = lengths[num - 1]; for (length = read_bits(d, 2, 3); length; --length) lengths[num++] = prev; break; }
        case 17: for (length = read_bits(d, 3, 3); length; --length) lengths[num++] = 0; break;
        case 18: for (length = read_bits(d, 7, 11); length; --length) lengths[num++] = 0; break;
        default: lengths[num++] = sym; break;
      }
    }
    build_tree(lt, lengths, 0, hlit);
    build_tree(dt, lengths, hlit, hdist);
  }
  function inflate_block_data(d, lt, dt) {
    while (1) {
      var sym = decode_symbol(d, lt);
      if (sym === 256) return;
      if (sym < 256) { d.dest[d.destLen++] = sym; }
      else {
        sym -= 257;
        var length = read_bits(d, length_bits[sym], length_base[sym]);
        var dist = decode_symbol(d, dt);
        var offs = d.destLen - read_bits(d, dist_bits[dist], dist_base[dist]);
        for (var i = offs; i < offs + length; ++i) d.dest[d.destLen++] = d.dest[i];
      }
    }
  }
  function inflate_uncompressed_block(d) {
    var length, invlength;
    while (d.bitcount > 8) { d.i--; d.bitcount -= 8; }
    length = d.s[d.i + 1] * 256 + d.s[d.i];
    invlength = d.s[d.i + 3] * 256 + d.s[d.i + 2];
    if (length !== (~invlength & 0xffff)) throw new Error('inflate: bad length');
    d.i += 4;
    for (var i = length; i; --i) d.dest[d.destLen++] = d.s[d.i++];
    d.bitcount = 0;
  }
  function inflateRaw(source, expectedSize) {
    var dest = new Uint8Array(expectedSize || Math.max(source.length * 12, 1 << 16));
    var d = new Data(source, dest), bfinal, btype;
    do {
      bfinal = getbit(d);
      btype = read_bits(d, 2, 0);
      // рост буфера при необходимости
      if (d.destLen > dest.length - (1 << 16)) {
        var bigger = new Uint8Array(dest.length * 2);
        bigger.set(dest); dest = bigger; d.dest = dest;
      }
      if (btype === 0) inflate_uncompressed_block(d);
      else if (btype === 1) inflate_block_data(d, sltree, sdtree);
      else if (btype === 2) { decode_trees(d, d.ltree, d.dtree); inflate_block_data(d, d.ltree, d.dtree); }
      else throw new Error('inflate: bad btype');
    } while (!bfinal);
    return dest.subarray(0, d.destLen);
  }
  function inflateZlib(source, expectedSize) {
    // пропускаем 2-байтовый zlib-заголовок
    return inflateRaw(source.subarray(2), expectedSize);
  }
  // init
  build_fixed_trees(sltree, sdtree);
  build_bits_base(length_bits, length_base, 4, 3);
  build_bits_base(dist_bits, dist_base, 2, 1);
  length_bits[28] = 0; length_base[28] = 258;

  /* ---------------- утилиты ---------------- */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
  function decodeEntities(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
  }

  /* ---------------- ZIP: достаём один файл по имени ---------------- */
  function unzipEntry(bytes, name) {
    // ищем локальные заголовки PK\x03\x04
    for (var i = 0; i + 30 < bytes.length; i++) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
        var method = u16(bytes, i + 8);
        var compSize = u32(bytes, i + 18);
        var uncompSize = u32(bytes, i + 22);
        var nameLen = u16(bytes, i + 26);
        var extraLen = u16(bytes, i + 28);
        var nm = utf8(bytes.subarray(i + 30, i + 30 + nameLen));
        var dataStart = i + 30 + nameLen + extraLen;
        if (nm === name) {
          var data = bytes.subarray(dataStart, dataStart + compSize);
          if (method === 0) return data;
          if (method === 8) return inflateRaw(data, uncompSize + 8);
          throw new Error('zip: неподдерживаемый метод сжатия');
        }
        // если размер известен — прыгаем дальше, иначе продолжаем побайтно
        if (compSize > 0) i = dataStart + compSize - 1;
      }
    }
    return null;
  }

  /* ---------------- DOCX ---------------- */
  function parseDocx(bytes) {
    var xmlBytes = unzipEntry(bytes, 'word/document.xml');
    if (!xmlBytes) throw new Error('docx: не найден word/document.xml');
    var xml = utf8(xmlBytes);
    xml = xml.replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br\b[^>]*\/?>/g, '\n');
    xml = xml.replace(/<[^>]+>/g, '');
    return decodeEntities(xml).replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---------------- PDF (best-effort извлечение текста) ---------------- */
  function latin1(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }

  // CP1251 → Unicode для старших байтов (частое кодирование русских PDF)
  var CP1251_HI = {
    0x80: 0x0402, 0x81: 0x0403, 0x82: 0x201A, 0x83: 0x0453, 0x84: 0x201E, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x20AC, 0x89: 0x2030, 0x8A: 0x0409, 0x8B: 0x2039,
    0x8C: 0x040A, 0x8D: 0x040C, 0x8E: 0x040B, 0x8F: 0x040F, 0x90: 0x0452, 0x91: 0x2018,
    0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x99: 0x2122, 0x9A: 0x0459, 0x9B: 0x203A, 0x9C: 0x045A, 0x9D: 0x045C, 0x9E: 0x045B,
    0x9F: 0x045F, 0xA0: 0x00A0, 0xA1: 0x040E, 0xA2: 0x045E, 0xA3: 0x0408, 0xA4: 0x00A4,
    0xA5: 0x0490, 0xA6: 0x00A6, 0xA7: 0x00A7, 0xA8: 0x0401, 0xA9: 0x00A9, 0xAA: 0x0404,
    0xAB: 0x00AB, 0xAC: 0x00AC, 0xAD: 0x00AD, 0xAE: 0x00AE, 0xAF: 0x0407, 0xB0: 0x00B0,
    0xB1: 0x00B1, 0xB2: 0x0406, 0xB3: 0x0456, 0xB4: 0x0491, 0xB5: 0x00B5, 0xB6: 0x00B6,
    0xB7: 0x00B7, 0xB8: 0x0451, 0xB9: 0x2116, 0xBA: 0x0454, 0xBB: 0x00BB, 0xBC: 0x0458,
    0xBD: 0x0405, 0xBE: 0x0455, 0xBF: 0x0457
  };
  function decodePdfStr(s) {
    // UTF-16BE (BOM FE FF)
    if (s.length >= 2 && s.charCodeAt(0) === 0xFE && s.charCodeAt(1) === 0xFF) {
      var out = '';
      for (var j = 2; j + 1 < s.length; j += 2) out += String.fromCharCode((s.charCodeAt(j) << 8) | s.charCodeAt(j + 1));
      return out;
    }
    // иначе трактуем старшие байты как CP1251
    var r = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) r += s[i];
      else if (c >= 0xC0) r += String.fromCharCode(c + 0x0350); // 0xC0..0xFF -> А..я
      else r += String.fromCharCode(CP1251_HI[c] || c);
    }
    return r;
  }

  function pdfDecodeTextString(str) {
    // обрабатываем escape-последовательности PDF-строк
    var out = '', i = 0;
    while (i < str.length) {
      var c = str[i];
      if (c === '\\') {
        var n = str[i + 1];
        if (n === 'n') { out += '\n'; i += 2; }
        else if (n === 'r') { out += '\r'; i += 2; }
        else if (n === 't') { out += '\t'; i += 2; }
        else if (n === '(' || n === ')' || n === '\\') { out += n; i += 2; }
        else if (n >= '0' && n <= '7') {
          var oct = n; i += 2; var k = 0;
          while (k < 2 && str[i] >= '0' && str[i] <= '7') { oct += str[i]; i++; k++; }
          out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        } else { out += n; i += 2; }
      } else { out += c; i++; }
    }
    return out;
  }

  function extractTextFromContent(content) {
    var out = [];
    // Tj: (текст) Tj    и    TJ: [(a)-250(b)] TJ
    var re = /\(((?:\\.|[^\\()]|\([^()]*\))*)\)\s*Tj|\[((?:\\.|[^\][]|\([^()]*\))*)\]\s*TJ/g;
    var m;
    while ((m = re.exec(content))) {
      if (m[1] !== undefined) {
        out.push(decodePdfStr(pdfDecodeTextString(m[1])));
      } else if (m[2] !== undefined) {
        var inner = m[2], sre = /\(((?:\\.|[^\\()])*)\)/g, sm, line = '';
        while ((sm = sre.exec(inner))) line += decodePdfStr(pdfDecodeTextString(sm[1]));
        out.push(line);
      }
    }
    return out.join(' ');
  }

  function parsePdf(bytes) {
    var raw = latin1(bytes);
    var text = '';
    // проходим по всем stream...endstream
    var re = /stream\r?\n/g, m;
    while ((m = re.exec(raw))) {
      var start = m.index + m[0].length;
      var end = raw.indexOf('endstream', start);
      if (end < 0) break;
      // словарь перед stream — ищем /FlateDecode
      var dictStart = raw.lastIndexOf('<<', m.index);
      var dict = dictStart >= 0 ? raw.slice(dictStart, m.index) : '';
      var streamBytes = bytes.subarray(start, end);
      var content = null;
      if (/FlateDecode/.test(dict)) {
        try { content = latin1(inflateZlib(streamBytes)); }
        catch (e) { try { content = latin1(inflateRaw(streamBytes)); } catch (e2) { content = null; } }
      } else if (!/\/(DCT|JPX|CCITT|Image)/.test(dict)) {
        content = latin1(streamBytes);
      }
      if (content && /(Tj|TJ)\b/.test(content)) text += extractTextFromContent(content) + '\n';
      re.lastIndex = end + 9;
    }
    return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---------------- публичный API ---------------- */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var name = (file.name || '').toLowerCase();
      var reader = new FileReader();
      var binary = /\.(docx|pdf)$/.test(name);
      reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
      reader.onload = function () {
        try {
          if (name.endsWith('.docx')) {
            resolve({ text: parseDocx(new Uint8Array(reader.result)), kind: 'docx' });
          } else if (name.endsWith('.pdf')) {
            var t = parsePdf(new Uint8Array(reader.result));
            resolve({ text: t, kind: 'pdf', weak: t.length < 40 });
          } else {
            var txt = String(reader.result || '');
            if (/\.(fb2|html?|xml)$/.test(name)) txt = txt.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
            resolve({ text: txt, kind: 'text' });
          }
        } catch (e) { reject(e); }
      };
      if (binary) reader.readAsArrayBuffer(file); else reader.readAsText(file);
    });
  }

  return { readFile: readFile, _parseDocx: parseDocx, _parsePdf: parsePdf, _inflateRaw: inflateRaw };
})();
