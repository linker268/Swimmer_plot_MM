# Swimmer's Plot Generator - Multiple Myeloma

다발골수종(MM) 임상 연구를 위한 Swimmer's Plot 생성 웹 앱입니다.

## 지원 반응 기준 (IMWG Criteria)

| 반응 | 색상 | 설명 |
|------|------|------|
| sCR | 진한 초록 | Stringent Complete Response |
| CR | 초록 | Complete Response |
| VGPR | 연두 | Very Good Partial Response |
| PR | 노랑 | Partial Response |
| MR | 주황 | Minimal Response |
| SD | 회색 | Stable Disease |
| PD | 빨강 | Progressive Disease |

## 데이터 형식

| 컬럼명 | 설명 | 필수 |
|--------|------|------|
| Cohort | 코호트/Arm 구분 | 선택 |
| Patient_ID | 환자 식별자 | 필수 |
| C1D1 | 치료 시작일 | 필수 |
| Resp_date1, Response1 | 반응 평가 | 필수 |
| ASCT_date | 자가조혈모세포이식 날짜 | 선택 |

## 로컬 개발

```bash
npm install
npm run dev
```

## 배포

Vercel에서 GitHub 연동 후 자동 배포
