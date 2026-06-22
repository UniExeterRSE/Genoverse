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

    const starts = Object.keys(chunks)
      .map(Number)
      .sort((a, b) => a - b);

    let fullSeq = '';

    const coordMap = [];

    for (let i = 0; i < starts.length; i++) {
      const s   = starts[i];
      const seq = chunks[s].sequence.toUpperCase();

      for (let j = 0; j < seq.length; j++) {
        fullSeq += seq[j];
        coordMap.push(s + j);
      }
    }

    // ── CHECK 1: sequence assembly ──────────────────────────────────────────
    // Verify chunks are contiguous and the assembled sequence looks right.
    // coordMap[0] should equal the start of the first chunk (e.g. 1).
    // coordMap[last] should equal the end of the last chunk.
    // If you see gaps (coordMap[N+1] - coordMap[N] > 1) something is wrong
    // with chunk alignment.
    console.group(`[ORF] chr=${chr}  chunks loaded: ${starts.length}`);
    console.log('chunk starts:', starts);
    console.log(`assembled seq length: ${fullSeq.length}`);
    console.log(`coord range: ${coordMap[0]} → ${coordMap[coordMap.length - 1]}`);
    console.log(`first 60 nt: ${fullSeq.slice(0, 60)}`);

    // Check for gaps between chunks
    for (let i = 1; i < starts.length; i++) {
      const prevEnd   = chunks[starts[i - 1]].end;
      const thisStart = chunks[starts[i]].start;

      if (thisStart !== prevEnd + 1) {
        console.warn(`  GAP between chunk ${starts[i - 1]} and ${starts[i]}: ${prevEnd} → ${thisStart}`);
      }
    }

    const orfs = { 0: [], 1: [], 2: [] };

    for (let frame = 0; frame < 3; frame++) {
      let inOrf    = false;
      let orfStart = null;

      for (let i = frame; i + 3 <= fullSeq.length; i += 3) {
        const codon = fullSeq.slice(i, i + 3);
        const aa    = CODON_TABLE[codon] || '?';
        const pos   = coordMap[i];

        if (!inOrf && aa === 'M') {
          inOrf    = true;
          orfStart = pos;
        }

        if (inOrf && aa === '*') {
          orfs[frame].push({ start: orfStart, end: pos + 2 });
          inOrf    = false;
          orfStart = null;
        }
      }

      if (inOrf && orfStart !== null) {
        orfs[frame].push({
          start : orfStart,
          end   : coordMap[coordMap.length - 1],
        });
      }
    }

    // ── CHECK 2: ORF summary ────────────────────────────────────────────────
    // For each frame, log the number of ORFs found and their coordinates.
    // Cross-check frame 0 against the known CDS_START from the template —
    // the canonical ORF should appear in exactly one frame starting at or
    // near that position.
    for (let frame = 0; frame < 3; frame++) {
      const frameOrfs = orfs[frame];

      console.group(`  frame +${frame}: ${frameOrfs.length} ORF(s)`);

      for (let k = 0; k < frameOrfs.length; k++) {
        const orf        = frameOrfs[k];
        const len        = orf.end - orf.start + 1;
        const seqIdx     = coordMap.indexOf(orf.start);
        const stopIdx    = coordMap.indexOf(orf.end - 2); // start of stop codon
        const startCodon = seqIdx  >= 0 ? fullSeq.slice(seqIdx,      seqIdx + 3)      : '???';
        const stopCodon  = stopIdx >= 0 ? fullSeq.slice(stopIdx, stopIdx + 3) : '???';

        console.log(
          `    ORF ${k}: pos ${orf.start}–${orf.end}  (${len} nt / ${Math.floor(len / 3)} codons)`
        + `  start=${startCodon}  stop=${stopCodon}`
        );
      }

      console.groupEnd();
    }

    // ── CHECK 3: spot-check a known codon ───────────────────────────────────
    // If you know the CDS starts at e.g. position 120, verify the codon there
    // is ATG and that isInOrf would return true for it in the correct frame.
    // Edit CDS_START_EXPECTED to match your test transcript.
    const CDS_START_EXPECTED = 61; // ← set this to your transcript's CDS start
    const cdsIdx             = coordMap.indexOf(CDS_START_EXPECTED);

    if (cdsIdx >= 0) {
      const cdsCodon = fullSeq.slice(cdsIdx, cdsIdx + 3);
      const cdsFrame = cdsIdx % 3;

      console.log(`CDS_START_EXPECTED (pos ${CDS_START_EXPECTED}): codon="${cdsCodon}" seqIdx=${cdsIdx} frame=${cdsFrame}`);

      const inCdsOrf = orfs[cdsFrame].some(
        r => CDS_START_EXPECTED >= r.start && CDS_START_EXPECTED <= r.end
      );

      console.log(`  → isInOrf for frame ${cdsFrame} at pos ${CDS_START_EXPECTED}: ${inCdsOrf}`);
    } else {
      console.warn(`CDS_START_EXPECTED pos ${CDS_START_EXPECTED} not yet in coordMap (chunk not loaded?)`);
    }

    console.groupEnd();

    this.orfsByChr[chr] = orfs;

    const chunkStarts = Object.keys(chunks);

    for (let i = 0; i < chunkStarts.length; i++) {
      chunks[chunkStarts[i]].orfs = orfs;
    }

    this.track.reset();
  },
});
