import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 로그인 뒤 화면·결제 콜백·API는 검색 결과에 나올 필요가 없다.
const PRIVATE = ["/api/", "/auth/", "/billing/", "/dev", "/generate", "/subscription", "/videos", "/login"];

// 답변 엔진·생성형 AI 검색이 서비스 소개를 인용할 수 있도록 주요 AI 크롤러를 명시적으로 허용한다(GEO).
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
