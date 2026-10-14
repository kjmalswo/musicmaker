# 추가 참조 분석과 가창 기법

2026-10-14 · 엔진 2.9.0

기존 100곡에 **새로운 100곡**과 **8명 × 대표곡 3곡**의 분석 통계를 추가했습니다. 대표곡 중 Attention과 Treasure는 기존 목록에도 있으므로 전체 고유 곡 수는 **222곡**입니다. 추가 100곡은 기존 목록과 대표곡 목록 모두에서 제외한 곡입니다.

| 범위 | 곡 수 |
| --- | ---: |
| 일본 시티팝 | 10 |
| 미국 컨트리 | 20 |
| 2010년대 영미팝 | 25 |
| 2010년대 K-pop | 25 |
| 2020년대 J-pop | 9 |
| 다른 시대·국가의 팝 | 11 |

국가·시대 분류와 대표곡 선정은 편집 분류입니다. Billboard 범위는 해당 시대의 대중적인 영미팝을 묶은 것이며 순위나 연말 Top 100 전체를 학습했다는 뜻은 아닙니다. 국가 표기는 아티스트의 출신/활동권이며 언어·발매 국가와 다를 수 있습니다. Paparazzi는 일본어로 발표된 K-pop 아티스트의 곡입니다.

| 아티스트 | 대표곡 |
| --- | --- |
| Charlie Puth | Attention / One Call Away / We Don't Talk Anymore |
| 米津玄師 | Lemon / Loser / Peace Sign |
| Official 髭男dism | Pretender / I LOVE… / Laughter |
| Mrs. Green Apple | Inferno / 青と夏 / ライラック |
| Bruno Mars | Treasure / 24K Magic / Locked Out of Heaven |
| Bill Evans | Autumn Leaves Take 1 (1960) / Waltz for Debby (1969 연주) / You Must Believe in Spring (1977 연주) |
| King Gnu | BOY / Sakayume / Ame Sansan |
| YOASOBI | Racing Into the Night / GUNJOU / Idol |

## 실제로 계산한 것

반복·순차·3도·도약·큰 도약의 분포, 음가 분포, 평균 음가, 음역 폭을 곡별로 집계합니다. 자료가 있는 경우 비화성음 비율, 약박 시작, 화성 전이, 코드 간격도 계산합니다. 곡마다 같은 가중치를 주며, 여러 악보 구간이 있는 곡이 목록을 지배하지 않게 구간 평균을 먼저 냅니다.

- SheetSage 80곡: 공개 음표·코드 주석에서 계산했습니다. 동일한 주석은 중복 제거했습니다. [SheetSage 연구 자료](https://github.com/chrisdonahue/sheetsage#hooktheory-dataset) 및 원 저자·주석자에게 귀속되며 **CC BY-NC-SA 3.0** 조건은 기존 자료와 같습니다.
- TheoryTab 39곡: 공개 곡 페이지의 측정값을 사용했습니다. **음정 차트는 박 길이로 가중된 값**, 음가 차트는 이벤트 수입니다. 백분위 순위를 발생 확률로 사용하지 않습니다. 화성 전이는 명확하게 해석 가능한 로마숫자만 포함하며, sus·no3·복잡한 변형은 제외합니다. 해석률을 곡별 기록에 남깁니다.
- Songsterr 2곡: 공개 보컬 파트의 실제 음정·음가에서 계산했습니다. 타이는 하나의 음으로 합칩니다. 리듬 기타 파트에서는 동시에 잡는 음의 간격만 측정합니다. Lilac의 파트명은 **Vocals (regenerated)**이므로 신뢰도를 낮췄습니다. 보컬·반주 파트 번호와 악보 리비전을 기록했습니다. 악보 원문을 재배포하지 않습니다.
- Jazz Trio Database 3곡: 실제 Bill Evans 연주의 **자동 피아노 MIDI 전사**와 검출된 박을 사용했습니다. 동시 어택의 최고음을 상성부 근사값으로 분석합니다. 보컬 선율·수작업으로 검증된 화성으로 취급하지 않습니다. Waltz for Debby 자료는 1969년 4/4 솔로 구간이며 원곡 3/4 헤드 분석이 아닙니다. [데이터 구조](https://huwcheston.github.io/Jazz-Trio-Database/installation/database-structure.html), [v02-zenodo 자료](https://github.com/HuwCheston/Jazz-Trio-Database/releases/tag/v02-zenodo), [이용 조건](https://github.com/HuwCheston/Jazz-Trio-Database/blob/main/LICENSE).

없는 항목은 `null`로 남겨 장르 이론 규칙을 유지합니다. 피아노 자동 전사의 넓은 음역을 그대로 사람의 보컬 음역에 적용하지 않습니다. 음원 청취·음원 학습이나 신경망 파인튜닝을 수행한 것으로 표시하지 않습니다. 원곡의 음표열·가사·음원은 저장된 결과 데이터에 포함되지 않습니다.

## 생성에 적용하는 곳

추가 장르 통계와 아티스트 통계를 장르별 기존 통계에 결합합니다. 아티스트 색채는 후보 음정·코드 전이 점수, 선율 윤곽, 음절 밀도와 리듬 셀, 반주·저음의 스타일 규칙에 적용합니다. 측정된 보이싱 간격이 있는 경우 보이싱 후보 평가에도 반영합니다. `아티스트 색채`를 0으로 두면 선택한 아티스트의 통계와 스타일을 사용하지 않습니다. 직접 지정한 진행, 음역, 종지·해결 규칙이 우선합니다.

가창 기법의 위치와 강도는 통계로 관측한 가수별 발생 횟수가 아니라 **장르·프레이즈에 대한 생성 규칙**입니다. [Berklee의 가창 표현 설명](https://online.berklee.edu/takenote/singing-lessons-to-develop-your-sound-and-style/)과 [팝·R&B 즉흥 가창 과정](https://online.berklee.edu/courses/improvisation-techniques-for-singing-pop-and-rb/)을 참고했습니다. 비브라토 속도·폭 등 수치는 엔진용 제안이며 교본의 측정값으로 표시하지 않습니다.

`가창 장식`은 멜리즈마·그레이스노트·벤딩·포르타멘토·비브라토·폴오프를 조절합니다. 같은 음절의 런은 실제 음표로 표시합니다. 짧은 그레이스·슬라이드와 비브라토는 목표음에 부착한 피치 곡선으로 표시·재생합니다. 핵심 훅의 어택과 길이는 유지하며, 짧은 음이나 음역 끝에는 비브라토를 강제로 넣지 않습니다. 악기 선율에는 보컬의 피치 곡선을 적용하지 않습니다.

## 재분석

`data/reference-extension-selection.json`에는 공개 자료 위치·선택 곡·리비전별 로컬 입력 이름이 있습니다. 원본을 작업 폴더에 확보한 다음 다음 명령으로 통계를 재생성합니다.

```text
node tools/analyze-reference-extension.cjs <원본 자료 폴더>
```

입력 폴더에는 핀된 `Hooktheory.json.gz`, URL을 파일명으로 인코딩한 `reference-page-cache/*.html`, 선택표의 Songsterr 파트 파일, `artist-jtd/<recording>/piano_midi.mid`, `beats.csv`, `metadata.json`이 필요합니다. 공개 페이지의 최신 변경을 다시 수집하면 통계·해시도 바뀝니다. 결과의 출처 해시·주석자·분석 구간·신뢰도를 함께 검토합니다.

Jazz Trio Database: MIT License · Copyright (c) 2023, Huw Cheston. [원문 이용 조건](https://github.com/HuwCheston/Jazz-Trio-Database/blob/main/LICENSE).
