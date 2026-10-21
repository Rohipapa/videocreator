import { FAQ, PLAN_SUMMARY, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// 생성형 AI 검색·답변 엔진용 사이트 요약(llmstxt.org 형식, GEO). 빌드할 때 정적으로 만든다.
export function GET() {
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME}는 만들고 싶은 장면을 텍스트로 설명하면 AI가 짧은 동영상을 만들어 주는 한국어 웹 서비스입니다. 영상 제작 경험이 없는 개인 창작자, 유튜브·쇼츠·릴스 제작자, 상품 소개 영상이 필요한 소상공인을 위해 만들었습니다.

## 핵심 정보

- 화면 비율: 16:9(유튜브), 9:16(쇼츠·릴스), 1:1(피드)
- 영상 길이: 5초, 10초
- 크레딧: 영상 1초당 2 크레딧(5초 10 크레딧, 10초 20 크레딧)
- 무료 체험: 가입하면 40 크레딧(10초 영상 2편), 카드 등록 없이 프로 요금제와 같은 조건
${PLAN_SUMMARY.map((p) => `- ${p.name} 요금제: 월 ${won(p.price)}, 월 ${p.credits.toLocaleString("ko-KR")} 크레딧, 최대 ${p.maxDuration}초 영상`).join("\n")}
- 결제: 토스페이먼츠 카드 자동결제(국내 발급 신용·체크카드), 매월 같은 날 결제
- 시스템 오류로 생성에 실패하면 크레딧 자동 복구, 미사용 크레딧은 이월되지 않음
- 첫 화면의 영상은 Mixkit·Pixabay 무료 라이선스 예시 영상이며 AI 생성 결과물이 아님

## 페이지

- [첫 화면](${SITE_URL}/): 서비스 소개, 예시 영상, 사용 방법, 자주 묻는 질문
- [요금제](${SITE_URL}/plans): 요금제별 가격·크레딧·최대 영상 길이

## 자주 묻는 질문

${FAQ.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
