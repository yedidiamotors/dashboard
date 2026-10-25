/* מנוע Word לטופסי IMR — נטען ע"י n8n (workflow: IMR — קריאת טופס חתום והפקת השנה הבאה).
   כותב רק לתוך התאים הריקים של הטופס המקורי של משרד התחבורה. בלי תלויות. */
// ---- IMR docx library (pure JS, no require) — used inside n8n Code nodes ----
// zip read (stored + deflate via built-in inflate), zip write (stored), table walker,
// stable field keys for IMR forms, and cell filling.

// ---------- inflate (RFC1951), adapted from tiny-inflate (MIT) ----------
function Tree() { this.table = new Uint16Array(16); this.trans = new Uint16Array(288); }
function Data(source, dest) {
  this.source = source; this.sourceIndex = 0; this.tag = 0; this.bitcount = 0;
  this.dest = dest; this.destLen = 0; this.ltree = new Tree(); this.dtree = new Tree();
}
const sltree = new Tree(), sdtree = new Tree();
const length_bits = new Uint8Array(30), length_base = new Uint16Array(30);
const dist_bits = new Uint8Array(30), dist_base = new Uint16Array(30);
const clcidx = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
const code_tree = new Tree(), lengths = new Uint8Array(288 + 32);
function build_bits_base(bits, base, delta, first) {
  let i, sum;
  for (i = 0; i < delta; ++i) bits[i] = 0;
  for (i = 0; i < 30 - delta; ++i) bits[i + delta] = i / delta | 0;
  for (sum = first, i = 0; i < 30; ++i) { base[i] = sum; sum += 1 << bits[i]; }
}
function build_fixed_trees(lt, dt) {
  let i;
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
const offs = new Uint16Array(16);
function build_tree(t, lens, off, num) {
  let i, sum;
  for (i = 0; i < 16; ++i) t.table[i] = 0;
  for (i = 0; i < num; ++i) t.table[lens[off + i]]++;
  t.table[0] = 0;
  for (sum = 0, i = 0; i < 16; ++i) { offs[i] = sum; sum += t.table[i]; }
  for (i = 0; i < num; ++i) if (lens[off + i]) t.trans[offs[lens[off + i]]++] = i;
}
function getbit(d) {
  if (!d.bitcount--) { d.tag = d.source[d.sourceIndex++]; d.bitcount = 7; }
  const bit = d.tag & 1; d.tag >>>= 1; return bit;
}
function read_bits(d, num, base) {
  if (!num) return base;
  while (d.bitcount < 24) { d.tag |= d.source[d.sourceIndex++] << d.bitcount; d.bitcount += 8; }
  const val = d.tag & (0xffff >>> (16 - num));
  d.tag >>>= num; d.bitcount -= num; return val + base;
}
function decode_symbol(d, t) {
  while (d.bitcount < 24) { d.tag |= d.source[d.sourceIndex++] << d.bitcount; d.bitcount += 8; }
  let sum = 0, cur = 0, len = 0, tag = d.tag;
  do { cur = 2 * cur + (tag & 1); tag >>>= 1; ++len; sum += t.table[len]; cur -= t.table[len]; } while (cur >= 0);
  d.tag = tag; d.bitcount -= len; return t.trans[sum + cur];
}
function decode_trees(d, lt, dt) {
  let i, num, length;
  const hlit = read_bits(d, 5, 257), hdist = read_bits(d, 5, 1), hclen = read_bits(d, 4, 4);
  for (i = 0; i < 19; ++i) lengths[i] = 0;
  for (i = 0; i < hclen; ++i) lengths[clcidx[i]] = read_bits(d, 3, 0);
  build_tree(code_tree, lengths, 0, 19);
  for (num = 0; num < hlit + hdist;) {
    const sym = decode_symbol(d, code_tree);
    switch (sym) {
      case 16: { const prev = lengths[num - 1]; for (length = read_bits(d, 2, 3); length; --length) lengths[num++] = prev; break; }
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
    let sym = decode_symbol(d, lt);
    if (sym === 256) return;
    if (sym < 256) { d.dest[d.destLen++] = sym; }
    else {
      sym -= 257;
      const length = read_bits(d, length_bits[sym], length_base[sym]);
      const dist = decode_symbol(d, dt);
      const offs2 = d.destLen - read_bits(d, dist_bits[dist], dist_base[dist]);
      for (let i = offs2; i < offs2 + length; ++i) d.dest[d.destLen++] = d.dest[i];
    }
  }
}
function inflate_uncompressed_block(d) {
  while (d.bitcount > 8) { d.sourceIndex--; d.bitcount -= 8; }
  let length = d.source[d.sourceIndex + 1]; length = 256 * length + d.source[d.sourceIndex];
  d.sourceIndex += 4;
  for (let i = length; i; --i) d.dest[d.destLen++] = d.source[d.sourceIndex++];
  d.bitcount = 0;
}
build_fixed_trees(sltree, sdtree);
build_bits_base(length_bits, length_base, 4, 3);
build_bits_base(dist_bits, dist_base, 2, 1);
length_bits[28] = 0; length_base[28] = 258;
function inflateRaw(source, outLen) {
  const d = new Data(source, new Uint8Array(outLen));
  let bfinal;
  do {
    bfinal = getbit(d);
    const btype = read_bits(d, 2, 0);
    if (btype === 0) inflate_uncompressed_block(d);
    else if (btype === 1) inflate_block_data(d, sltree, sdtree);
    else if (btype === 2) { decode_trees(d, d.ltree, d.dtree); inflate_block_data(d, d.ltree, d.dtree); }
    else throw new Error('bad deflate block');
  } while (!bfinal);
  return d.dest.subarray(0, d.destLen);
}

// ---------- zip ----------
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function readZip(buf) {
  // central directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (u32(buf, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const n = u16(buf, eocd + 10); let p = u32(buf, eocd + 16);
  const files = [];
  for (let k = 0; k < n; k++) {
    if (u32(buf, p) !== 0x02014b50) throw new Error('bad central directory');
    const method = u16(buf, p + 10), csize = u32(buf, p + 20), usize = u32(buf, p + 24);
    const nl = u16(buf, p + 28), el = u16(buf, p + 30), cl = u16(buf, p + 32), lho = u32(buf, p + 42);
    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nl)).toString('utf8');
    const lnl = u16(buf, lho + 26), lel = u16(buf, lho + 28);
    const start = lho + 30 + lnl + lel;
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw; else if (method === 8) data = inflateRaw(raw, usize); else throw new Error('zip method ' + method);
    files.push({ name, data: new Uint8Array(data) });
    p += 46 + nl + el + cl;
  }
  return files;
}
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(d) { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function writeZip(files) {
  const parts = [], central = []; let off = 0;
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (10 << 5) | 25;
  for (const f of files) {
    const nameB = Buffer.from(f.name, 'utf8'); const data = Buffer.from(f.data); const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nameB, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nameB);
    off += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

// ---------- XML helpers ----------
function decodeEnt(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function textOf(xml) {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g; let m;
  while ((m = re.exec(xml))) out += m[1] !== undefined ? decodeEnt(m[1]) : ' ';
  return out.replace(/\s+/g, ' ').trim();
}
// find balanced <tag ...>...</tag> elements at the top level of `xml` (no nesting of same tag across siblings)
function elements(xml, tag, from, to) {
  const res = []; const open = '<' + tag; const close = '</' + tag + '>';
  let i = from || 0; const end = to == null ? xml.length : to;
  while (true) {
    let s = xml.indexOf(open, i);
    while (s >= 0 && s < end && !/[\s>\/]/.test(xml[s + open.length])) s = xml.indexOf(open, s + 1);
    if (s < 0 || s >= end) break;
    // self-closing?
    const gt = xml.indexOf('>', s);
    if (xml[gt - 1] === '/') { res.push({ start: s, end: gt + 1 }); i = gt + 1; continue; }
    let depth = 1, j = gt + 1;
    while (depth > 0) {
      let no = xml.indexOf(open, j);
      while (no >= 0 && !/[\s>\/]/.test(xml[no + open.length])) no = xml.indexOf(open, no + 1);
      const nc = xml.indexOf(close, j);
      if (nc < 0) throw new Error('unbalanced ' + tag);
      if (no >= 0 && no < nc) { const g2 = xml.indexOf('>', no); if (xml[g2 - 1] !== '/') depth++; j = g2 + 1; }
      else { depth--; j = nc + close.length; }
    }
    res.push({ start: s, end: j }); i = j;
  }
  return res;
}

// ---------- IMR structure walk ----------
function slug(s) {
  return String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'x';
}
/* walk(xml) → { slots: [{key,label,kind,cell:{start,end},after?}], standards:[{key,code,subject,group,remarks}] }
   kind: 'value' (empty cell), 'mark' (YES/NO/N/A column), 'note' (appended to remarks cell), 'yesno' (after "Yes -"/"No -") */
function walk(xml) {
  const bodyStart = xml.indexOf('<w:body>');
  const slots = [], standards = [];
  const used = new Set();
  const uniq = (k) => { let b = k, n = 2; while (used.has(k)) k = b + '_' + n++; used.add(k); return k; };
  let section = 'info', group = '';
  // top level children of body: paragraphs and tables in order
  const tbls = elements(xml, 'w:tbl', bodyStart);
  let cursor = bodyStart;
  for (const tb of tbls) {
    // headings in the paragraphs before this table
    for (const pe of elements(xml, 'w:p', cursor, tb.start)) {
      const pt = textOf(xml.slice(pe.start, pe.end)).toLowerCase();
      if (!pt || pt.length > 140) continue;
      if (/^information document/.test(pt)) section = 'info';
      else if (/regulations and standards\s*$/.test(pt)) section = 'std';
      else if (/^(legal conformity|declaration|manufacturer.s obligations)/.test(pt)) section = 'decl';
      else if (/^annex/.test(pt)) section = 'annex';
      if (/^2\.3\s*transmission/.test(pt)) group = 'Transmission';
    }
    cursor = tb.end;
    const rows = elements(xml, 'w:tr', tb.start, tb.end).filter(r => !insideNestedTbl(xml, tb, r));
    const rowCells = rows.map(r => elements(xml, 'w:tc', r.start, r.end).map(c => ({ start: c.start, end: c.end, text: textOf(xml.slice(c.start, c.end)) })));
    const allText = rowCells.map(r => r.map(c => c.text).join(' | ')).join('\n');
    if (/Israeli Mandatory Requirements/.test(allText) && rowCells.length === 1) continue; // title box
    if (/I hereby declare/.test(allText)) continue; // declaration: left for the signer
    if (/SUBJECT/.test(allText) && /COMPLIES/.test(allText) || (section === 'std' && rowCells.some(r => r.length >= 6))) {
      section = 'std';
      let tgroup = '';
      for (const cells of rowCells) {
        const nonEmpty = cells.filter(c => c.text);
        if (cells.length < 6) {
          if (nonEmpty.length === 1 && cells.length <= 2 && /^remarks/i.test(nonEmpty[0].text)) {
            slots.push({ key: uniq('std.remarks'), label: 'Remarks (standards chapter)', kind: 'append', cell: cells[0] });
          } else if (nonEmpty.length === 1) tgroup = nonEmpty[0].text;
          continue;
        }
        const t = cells.map(c => c.text);
        if (/^(YES)$/i.test(t[2]) || /SUBJECT/.test(t.join(' '))) continue;
        const code = t[0], subj = t[1];
        if (!code && !subj) continue;
        let key = 's.' + slug(code || subj);
        if (code && (used.has(key) || !/\d/.test(code))) key = 's.' + slug(code).slice(0, 24) + '_' + slug(subj).slice(0, 24);
        key = uniq(key);
        const remCell = cells[cells.length - 1];
        standards.push({ key, code, subject: subj, group: tgroup, remarks: remCell.text });
        slots.push({ key: key + '.yes', kind: 'mark', cell: cells[cells.length - 4] });
        slots.push({ key: key + '.no', kind: 'mark', cell: cells[cells.length - 3] });
        slots.push({ key: key + '.na', kind: 'mark', cell: cells[cells.length - 2] });
        slots.push({ key: key + '.note', kind: 'note', cell: remCell });
      }
      continue;
    }
    if (/ANNEX/.test(allText) || rowCells.some(r => r.length >= 17)) {
      // VIN description: the row after the 1..17 numbers
      let numRow = rowCells.findIndex(r => r.filter(c => /^\d{1,2}$/.test(c.text)).length >= 17);
      if (numRow >= 0 && rowCells[numRow + 1]) {
        let nxt = rowCells[numRow + 1];
        if (nxt.length < 17 && rowCells[numRow + 2]) nxt = rowCells[numRow + 2].length >= 17 ? rowCells[numRow + 2] : nxt;
        const numCells = rowCells[numRow].filter(c => /^\d{1,2}$/.test(c.text));
        if (nxt.length >= 17) {
          // align by position of number cells
          const idx = rowCells[numRow].map((c, i) => /^\d{1,2}$/.test(c.text) ? i : -1).filter(i => i >= 0);
          idx.forEach((ci, n) => { if (nxt[ci]) slots.push({ key: uniq('vin.p' + (n + 1)), label: 'VIN description – position ' + (n + 1), kind: 'value', cell: nxt[ci] }); });
        } else if (nxt.length >= 1) {
          slots.push({ key: uniq('vin.description'), label: 'VIN description (positions 1-17)', kind: 'value', cell: nxt[0] });
        }
      }
      continue;
    }
    if (section === 'decl') continue;
    // ---- information document tables ----
    // label cells = text cells or vertically-merged continuation cells (<w:vMerge/>) before the empty value cells
    let lastLab = '', header = null, tireN = 0, pendingRemarks = false;
    const carry = {};
    for (const cells of rowCells) {
      let gc = 0;
      cells.forEach(c => {
        const pr = xml.slice(c.start, c.end).split('<w:p')[0];
        c.vcont = /<w:vMerge\/>|<w:vMerge w:val="continue"\/>/.test(pr);
        const sp = pr.match(/<w:gridSpan w:val="(\d+)"/); c.grid = gc; gc += sp ? +sp[1] : 1;
      });
      const t = cells.map(c => c.text);
      if (cells.length === 1) {
        const x = t[0];
        if (!x) {
          if (pendingRemarks) { slots.push({ key: uniq(`i.${slug(group)}.remarks`), label: `${group || 'Vehicle'} › Remarks`, kind: 'value', cell: cells[0] }); pendingRemarks = false; }
          continue;
        }
        if (/^remarks:?$/i.test(x)) { pendingRemarks = true; continue; }
        if (/^remarks/i.test(x)) { slots.push({ key: uniq(`i.${slug(group)}.remarks`), label: `${group || 'Vehicle'} › Remarks`, kind: 'append', cell: cells[0] }); continue; }
        group = x.replace(/^[\d.]+\s*/, ''); header = null; lastLab = ''; pendingRemarks = false;
        for (const k in carry) delete carry[k];
        continue;
      }
      pendingRemarks = false;
      if (/^Transmission/.test(t[0])) group = 'Transmission';
      const isYN = i => /Yes\s*-/.test(t[i]) && /No\s*-/.test(t[i]);
      const labelish = i => (t[i] && !isYN(i)) || cells[i].vcont;
      let labelEnd = 0;
      cells.forEach((c, i) => { if (labelish(i)) labelEnd = i + 1; });
      const textCount = t.filter((x, i) => x && !isYN(i)).length;
      const emptiesAfter = cells.slice(labelEnd).filter((c, i) => !t[labelEnd + i]).length;
      const ynCount = cells.filter((c, i) => isYN(i)).length;
      // header row: every cell after the first has text (or the "Axle No." row)
      if (!ynCount && textCount >= 2 && (emptiesAfter === 0 || /^Axle No/i.test(t[0]))) {
        header = {}; cells.forEach((c, i) => { header[c.grid] = t[i]; if (t[i]) carry[i] = t[i]; }); header.__first = t[0]; continue;
      }
      // marks right under a header (Manual | Automatic)
      const g = slug(group || 'vehicle');
      if (!textCount && !ynCount && header && labelEnd === 0) {
        cells.forEach((c, i) => { const hn = header[c.grid]; if (i > 0 && hn) slots.push({ key: uniq(`i.${g}.${slug(hn)}`), label: `${group} › ${hn} (mark X)`, kind: 'value', cell: c }); });
        header = null; continue;
      }
      const labs = [], own = [];
      for (let i = 0; i < labelEnd; i++) {
        if (t[i] && !isYN(i)) { carry[i] = t[i]; for (const k in carry) if (+k > i) delete carry[k]; labs.push(t[i]); own.push(t[i]); }
        else if (cells[i].vcont && carry[i]) labs.push(carry[i]);
      }
      let lab = labs.join(' ');
      const ownDigit = own.find(l => /^\d$/.test(l));
      const tireCtx = /tire/i.test(labs.join(' ')) || /^Tire row/.test(lastLab);
      if (tireCtx && (ownDigit || own.some(l => /Tire Size/i.test(l)))) {
        tireN = ownDigit ? +ownDigit : (tireN || 1);
        lab = `Tire row ${tireN} – tire size`;
      } else if (tireCtx && (own.some(l => /load capacity/i.test(l)) || (!own.length && /tire size$/.test(lastLab)))) {
        lab = `Tire row ${tireN} – load index / speed symbol`;
      } else if (!lab) lab = (lastLab || group) + ' (2nd line)';
      else if (!own.length && lab === lastLab.replace(/ \(2nd line\)$/, '')) lab = lab + ' (2nd line)';
      lastLab = lab;
      const targets = [];
      cells.forEach((c, i) => { if (i >= labelEnd && !t[i] && !c.vcont) targets.push(i); else if (isYN(i)) targets.push(i); });
      targets.sort((x, y) => x - y);
      const multi = targets.length > 1;
      let col = 0;
      for (const i of targets) {
        col++;
        const hdrNames = header ? Object.keys(header).filter(k => k !== '__first' && +k > 0 && header[k]).length : 0;
        const hn = header && hdrNames === targets.length && header[cells[i].grid] && !/^Axle No/i.test(header[cells[i].grid]) ? header[cells[i].grid] : '';
        const colName = hn || (multi ? `column ${col}` : '');
        const base = `i.${g}.${slug(lab)}` + (multi ? `.c${col}` : '');
        const human = `${group ? group + ' › ' : ''}${lab}${colName ? ' [' + colName + ']' : ''}`;
        if (isYN(i)) {
          slots.push({ key: uniq(base + '.yes'), label: human + ' – Yes (mark X)', kind: 'yes', cell: cells[i] });
          slots.push({ key: uniq(base + '.no'), label: human + ' – No (mark X)', kind: 'no', cell: cells[i] });
        } else slots.push({ key: uniq(base), label: human, kind: 'value', cell: cells[i] });
      }
    }
  }
  return { slots, standards };
}
function insideNestedTbl(xml, tb, r) { return false; }

// ---------- fill ----------
function runXml(text, rPr) {
  return '<w:r>' + (rPr || '') + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
}
function cellRpr(cellXml) {
  const m = cellXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  if (m) return m[0].replace(/<w:b\/>|<w:b w:val="[^"]*"\/>|<w:bCs\/>|<w:i\/>|<w:iCs\/>|<w:color [^>]*\/>|<w:u [^>]*\/>|<w:highlight [^>]*\/>/g, '');
  const p = cellXml.match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/);
  return p ? p[1] : '<w:rPr><w:sz w:val="18"/></w:rPr>';
}
// put `text` into a cell: value → first paragraph (end); note/append → new paragraph at the end
function fillCell(cellXml, text, kind) {
  if (text == null || text === '') return cellXml;
  const rPr = cellRpr(cellXml);
  const lines = String(text).split(/\n/);
  if (kind === 'note' || kind === 'append') {
    const ps = elements(cellXml, 'w:p');
    const last = ps[ps.length - 1];
    const pPrM = last ? cellXml.slice(last.start, last.end).match(/<w:pPr>[\s\S]*?<\/w:pPr>/) : null;
    const add = lines.map(l => '<w:p>' + (pPrM ? pPrM[0] : '') + runXml(l, rPr) + '</w:p>').join('');
    const end = cellXml.lastIndexOf('</w:tc>');
    return cellXml.slice(0, end) + add + cellXml.slice(end);
  }
  if (kind === 'yes' || kind === 'no') {
    // insert right after the run containing "Yes -" / "No -"
    const word = kind === 'yes' ? 'Yes' : 'No';
    const runs = elements(cellXml, 'w:r');
    for (const r of runs) {
      const rt = textOf(cellXml.slice(r.start, r.end));
      if (new RegExp('\\b' + word + '\\b').test(rt)) {
        return cellXml.slice(0, r.end) + runXml(' ' + text + ' ', rPr) + cellXml.slice(r.end);
      }
    }
    return fillCell(cellXml, word + ': ' + text, 'note');
  }
  const ps = elements(cellXml, 'w:p');
  if (!ps.length) { const end = cellXml.lastIndexOf('</w:tc>'); return cellXml.slice(0, end) + '<w:p>' + runXml(text, rPr) + '</w:p>' + cellXml.slice(end); }
  const p = ps[0];
  const pend = p.end - '</w:p>'.length;
  let ins = lines.map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + runXml(l, rPr)).join('');
  if (cellXml.slice(p.start, p.end).endsWith('/>')) { // <w:p/>
    return cellXml.slice(0, p.start) + '<w:p>' + ins + '</w:p>' + cellXml.slice(p.end);
  }
  return cellXml.slice(0, pend) + ins + cellXml.slice(pend);
}
// values: {key: text}. Marks: values[key] truthy → 'X'
function fillXml(xml, values) {
  const { slots } = walk(xml);
  // group edits by cell, apply from the end so offsets stay valid
  const byCell = new Map();
  for (const s of slots) {
    let v = values[s.key];
    if (v == null || v === '' || v === false) continue;
    if (s.kind === 'mark') v = 'X';
    if (v === true) v = 'X';
    const k = s.cell.start + ':' + s.cell.end;
    if (!byCell.has(k)) byCell.set(k, { cell: s.cell, edits: [] });
    byCell.get(k).edits.push({ kind: s.kind, text: String(v) });
  }
  const cellsSorted = [...byCell.values()].sort((a, b) => b.cell.start - a.cell.start);
  let out = xml, filled = 0;
  for (const c of cellsSorted) {
    let cx = out.slice(c.cell.start, c.cell.end);
    // marks/values centred in their own cell; 'no' before 'yes' so both anchors survive
    c.edits.sort((a, b) => (a.kind === 'no' ? -1 : 0) - (b.kind === 'no' ? -1 : 0));
    for (const e of c.edits) { cx = fillCell(cx, e.text, e.kind); filled++; }
    out = out.slice(0, c.cell.start) + cx + out.slice(c.cell.end);
  }
  return { xml: out, filled };
}
function fieldMap(xml) {
  const { slots, standards } = walk(xml);
  const fields = slots.filter(s => s.kind !== 'mark' && s.kind !== 'note').map(s => ({ key: s.key, label: s.label || s.key }));
  return { fields, standards };
}
function docxFill(buf, values) {
  const files = readZip(buf);
  let filled = 0;
  for (const f of files) {
    if (f.name === 'word/document.xml') {
      const r = fillXml(Buffer.from(f.data).toString('utf8'), values);
      f.data = Buffer.from(r.xml, 'utf8'); filled = r.filled;
    }
  }
  return { buffer: writeZip(files), filled };
}
function docxMap(buf) {
  const f = readZip(buf).find(x => x.name === 'word/document.xml');
  return fieldMap(Buffer.from(f.data).toString('utf8'));
}
