"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useCallback,
} from "react";

type QueryBase = {
  page: number;
  pageSize: number;
  name?: string;
  subjects?: string[];
  topics?: string[];
  types?: string[];
  createdStart?: string;
  createdEnd?: string;
};

type Fetcher = (
  q: QueryBase
) => Promise<{ rows: any[]; page: number; pageCount: number; total: number }>;

export function usePagedQuery(initialQuery: QueryBase, fetcher: Fetcher) {
  const [q, setQ] = useState<QueryBase>(initialQuery);
  const [data, setData] = useState({
    rows: [] as any[],
    page: 1,
    pageCount: 1,
  });
  const [isPending, startTrans] = useTransition();
  const seqRef = useRef(0);

  const fetchWith = useCallback(
    (next: QueryBase) => {
      const mySeq = ++seqRef.current;
      startTrans(async () => {
        try {
          const res = await fetcher(next);
          if (mySeq !== seqRef.current) return; // ignore stale responses
          setData({ rows: res.rows, page: res.page, pageCount: res.pageCount });
          setQ({ ...next, page: res.page }); // reflect backend page clamp
        } catch {
          // optionally: toast or error state
        }
      });
    },
    [fetcher]
  );

  const setPage = useCallback(
    (page: number) => {
      const next = { ...q, page };
      setQ(next);
      fetchWith(next);
    },
    [q, fetchWith]
  );

  const refetch = useCallback(
    (pageOverride?: number) => {
      fetchWith({ ...q, page: pageOverride ?? q.page });
    },
    [q, fetchWith]
  );

  // handy if you need to cancel in-flight & clear
  const bumpSeq = useCallback(() => {
    seqRef.current++;
  }, []);

  return { q, setQ, data, isPending, fetchWith, setPage, refetch, bumpSeq };
}
