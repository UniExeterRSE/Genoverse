// Genoverse/src/js/Track/Model/Sequence.js
import Model from '../Model';

/**
 * Standard genetic code — 64 codons
 */
const CODON_TABLE = {
  TTT : 'F',
  TTC : 'F',
  TTA : 'L',
  TTG : 'L',
  CTT : 'L',
  CTC : 'L',
  CTA : 'L',
  CTG : 'L',
  ATT : 'I',
  ATC : 'I',
  ATA : 'I',
  ATG : 'M',
  GTT : 'V',
  GTC : 'V',
  GTA : 'V',
  GTG : 'V',
  TCT : 'S',
  TCC : 'S',
  TCA : 'S',
  TCG : 'S',
  CCT : 'P',
  CCC : 'P',
  CCA : 'P',
  CCG : 'P',
  ACT : 'T',
  ACC : 'T',
  ACA : 'T',
  ACG : 'T',
  GCT : 'A',
  GCC : 'A',
  GCA : 'A',
  GCG : 'A',
  TAT : 'Y',
  TAC : 'Y',
  TAA : '*',
  TAG : '*',
  CAT : 'H',
  CAC : 'H',
  CAA : 'Q',
  CAG : 'Q',
  AAT : 'N',
  AAC : 'N',
  AAA : 'K',
  AAG : 'K',
  GAT : 'D',
  GAC : 'D',
  GAA : 'E',
  GAG : 'E',
  TGT : 'C',
  TGC : 'C',
  TGA : '*',
  TGG : 'W',
  CGT : 'R',
  CGC : 'R',
  CGA : 'R',
  CGG : 'R',
  AGT : 'S',
  AGC : 'S',
  AGA : 'R',
  AGG : 'R',
  GGT : 'G',
  GGC : 'G',
  GGA : 'G',
  GGG : 'G',
};

export default Model.extend({
  threshold   : 100000,
  chunkSize   : 1000,
  buffer      : 0,
  dataType    : 'text',
  chunksByChr : null,
  orfsByChr   : null,

  setChrProps() {
    const chr = this.browser.chr;

    this.base();

    this.chunksByChr      = this.chunksByChr || {};
    this.chunksByChr[chr] = this.chunksByChr[chr] || {};

    this.orfsByChr      = this.orfsByChr || {};
    this.orfsByChr[chr] = this.orfsByChr[chr] || { 0: [], 1: [], 2: [] };
  },

  getData(chr, start, end) {
    start = start - (start % this.chunkSize) + 1;
    end   = end + this.chunkSize - (end % this.chunkSize);

    return this.base(chr, start, end);
  },

  parseData(data, chr, start) {
    data = data.replace(/\n/g, '');

    if (this.prop('lowerCase')) {
      data = data.toLowerCase();
    }

    const feature = {
      id       : `${chr}:${start}`,
      chr      : chr,
      start    : start,
      end      : start + data.length - 1,
      sequence : data,
    };

    this.chunksByChr[chr][start] = feature;
    this.insertFeature(feature);

    this.computeOrfs(chr);
  },

  computeOrfs(chr) {
    const chunks = this.chunksByChr[chr];

    if (!chunks) return;

    // Sort loaded chunk starts ascending so the assembled sequence is
    // contiguous. coordMap[i] gives the genomic position of fullSeq[i].
    const starts = Object.keys(chunks)
      .map(Number)
      .sort((a, b) => a - b);

    let fullSeq  = '';
    const coordMap = [];

    for (let i = 0; i < starts.length; i++) {
      const s   = starts[i];
      const seq = chunks[s].sequence.toUpperCase();

      for (let j = 0; j < seq.length; j++) {
        fullSeq += seq[j];
        coordMap.push(s + j);
      }
    }

    const orfs = { 0: [], 1: [], 2: [] };

    for (let frame = 0; frame < 3; frame++) {
      let inOrf    = false;
      let orfStart = null;

      // Step through the assembled sequence in-frame, translating one codon
      // at a time. pos is the genomic coordinate of the codon's first base.
      for (let i = frame; i + 3 <= fullSeq.length; i += 3) {
        const codon = fullSeq.slice(i, i + 3);
        const aa    = CODON_TABLE[codon] || '?';
        const pos   = coordMap[i];

        if (!inOrf && aa === 'M') {
          inOrf    = true;
          orfStart = pos;
        }

        if (inOrf && aa === '*') {
          // orf.end is the last base of the stop codon (pos + 2)
          orfs[frame].push({ start: orfStart, end: pos + 2 });
          inOrf    = false;
          orfStart = null;
        }
      }

      // Truncated ORF: started but no stop codon seen yet in loaded chunks.
      // Extend to the last loaded base so rendering can show it provisionally.
      if (inOrf && orfStart !== null) {
        orfs[frame].push({
          start : orfStart,
          end   : coordMap[coordMap.length - 1],
        });
      }
    }

    this.orfsByChr[chr] = orfs;

    // Stamp the ORF map onto every loaded chunk so the View can read it
    // without a separate lookup.
    const chunkStarts = Object.keys(chunks);

    for (let i = 0; i < chunkStarts.length; i++) {
      chunks[chunkStarts[i]].orfs = orfs;
    }

    this.track.reset();
  },
});