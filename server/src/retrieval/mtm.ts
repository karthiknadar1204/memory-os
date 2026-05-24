import {
  listSegmentsForMatching,
  listPagesByIds,
  bumpSegmentsOnRetrieval,
  type MTMPage,
} from '../memory/mtm';
import { cosine, jaccard } from '../utils/keywords';
import { ns } from '../utils/pinecone';
import { mtmQueues } from '../queues/mtm';

// Paper Sec 4.1: top-m segments = 5, top-k pages = 10.
export const TOP_M_SEGMENTS = 5;
export const TOP_K_PAGES    = 10;

export type MTMRetrievalResult = {
  segmentIds: string[];     // top-m used (for debug / bookkeeping)
  pages: MTMPage[];          // top-k pages, already hydrated
};

// Run two-stage MTM retrieval (paper Sec 3.4).
//
//   Stage 1 — pick top-m segments by F_score = cosine + Jaccard.
//             We score in-app against Postgres (strongly consistent),
//             not Pinecone (eventually consistent).
//
//   Stage 2 — within those segments, pick top-k pages by cosine.
//             We use Pinecone (where page vectors live).
//
//   Bookkeeping — n_visit++ and last_access_time = now on the top-m segments
//                 (paper Sec 3.4). Also enqueue heat-check so popular segments
//                 can naturally promote into LPM over time.
export async function retrieveMTM(args: {
  userId: string;
  queryVector: number[];
  queryKeywords: string[];
}): Promise<MTMRetrievalResult> {
  const { userId, queryVector, queryKeywords } = args;

  // ----- Stage 1: top-m segments via in-app F_score over Postgres -----
  const candidates = await listSegmentsForMatching(userId);
  if (candidates.length === 0) {
    return { segmentIds: [], pages: [] };
  }

  const scored = candidates.map((seg) => {
    const cos  = seg.embedding ? cosine(queryVector, seg.embedding) : 0;
    const jacc = jaccard(seg.keywords, queryKeywords);
    return { id: seg.id, fScore: cos + jacc };
  });
  scored.sort((a, b) => b.fScore - a.fScore);
  const topSegments = scored.slice(0, TOP_M_SEGMENTS);
  const topSegmentIds = topSegments.map((s) => s.id);

  // ----- Stage 2: top-k pages via Pinecone -----
  let pages: MTMPage[] = [];
  if (topSegmentIds.length > 0) {
    const search = await ns.mtmPages().query({
      vector: queryVector,
      topK: TOP_K_PAGES,
      filter: {
        user_id: userId,
        segment_id: { $in: topSegmentIds } as any,
      },
      includeMetadata: false,
    });

    const matchIds = (search.matches ?? []).map((m) => String(m.id));
    if (matchIds.length > 0) {
      const hydrated = await listPagesByIds(matchIds);
      // preserve Pinecone's relevance order
      const byId = new Map(hydrated.map((p) => [p.id, p]));
      pages = matchIds.map((id) => byId.get(id)).filter(Boolean) as MTMPage[];
    }
  }

  // ----- Bookkeeping (paper Sec 3.4) -----
  //   - n_visit++ and last_access_time = NOW on each of the top-m segments.
  //   - Then enqueue heat-check so segments with rising heat can promote naturally.
  if (topSegmentIds.length > 0) {
    await bumpSegmentsOnRetrieval(topSegmentIds);
    // fire-and-forget — heat-check handles itself
    void Promise.all(
      topSegmentIds.map((segmentId) =>
        mtmQueues.heatCheck.add(
          'check',
          { segmentId, userId },
          // time-bucket dedup: avoid bursts of identical heat-checks
          { jobId: `heat-check-${segmentId}-${Math.floor(Date.now() / 60000)}` },
        ),
      ),
    );
  }

  return { segmentIds: topSegmentIds, pages };
}
