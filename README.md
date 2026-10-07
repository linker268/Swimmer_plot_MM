# Swimmer's Plot Generator - Multiple Myeloma

다발골수종(MM) 임상 연구를 위한 Swimmer's Plot 생성 웹 앱입니다.

## 지원 반응 기준 (IMWG Criteria)

| 반응 | 막대 색 | 설명 |
|------|------|------|
| sCR | #123C7A (가장 진한 남색) | Stringent Complete Response |
| CR | #1F52A0 | Complete Response |
| VGPR | #2E6FBE | Very Good Partial Response |
| PR | #3B8FD4 | Partial Response |
| MR | #63B3E0 | Minimal Response |
| SD | #9BD3E8 (가장 연한 파랑) | Stable Disease |
| PD | 빨간 ● 마커 (막대는 PD 시점에서 끝) | Progressive Disease |
| MRD− / MRD+ | 흰 ○ / 흰 ○ 빨간 테 (검사 시점 마커) | 별도 열 `MRD_date/MRD_result` |

막대는 C1D1~첫 평가가 회색(pre-assessment), 이후 평가 시점부터 다음 평가까지 그 반응색으로 채워진다.
마지막 반응은 `LastFU_date`(또는 사망일)까지 유지된 것으로 그린다. 회색 점선은 PD ● 이후·drop-out // 이후의
생존 추적 구간에만 나타난다. 치료 종료(EOT)는 막대에 흰 틈이 있는 검은 세로선.

## 데이터 형식

| 컬럼명 | 설명 | 필수 |
|--------|------|------|
| Cohort | 코호트/Arm 구분 | 선택 |
| Patient_ID | 환자 식별자 | 필수 |
| C1D1 | 치료 시작일 | 필수 |
| Resp_date1, Response1 | 반응 평가 | 필수 |
| ASCT_date | 자가조혈모세포이식 날짜 | 선택 |
| MRD_date1, MRD_result1, ... | MRD 검사일·결과 (neg/pos) | 선택 |
| Tx_status / EOT_date / Dropout_date / LastDose_date | ongoing·EOT·dropout 및 날짜 | 선택 |
| LastFU_date | 마지막 추적일 = 막대 끝 | 선택 |
| Death_date | 사망일 | 선택 |
| AE_name1, AE_date1, AE_grade1, ... | 주요 이상반응 (막대 위 라벨) | 선택 |

## 로컬 개발

```bash
npm install
npm run dev
```

## 배포

Vercel에서 GitHub 연동 후 자동 배포
