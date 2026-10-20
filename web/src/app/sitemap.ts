import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 공개 페이지만 싣는다. 내용을 크게 바꾸면 lastModified도 고친다.
const UPDATED = "2026-10-21";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: UPDATED, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/plans`, lastModified: UPDATED, changeFrequency: "monthly", priority: 0.8 },
  ];
}
