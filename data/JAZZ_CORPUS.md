# 재즈 100곡과 장르 간 전이

2026-10-14 기준. 서로 다른 100곡을 선정했다. 원곡 오디오·전체 악보·가사·음표 시퀀스는 저장소에 넣지 않는다. 공개 주석에서 계산한 통계를 후보 탐색의 사전 가중치로 사용하며, 신경망이나 오디오 생성 모델을 학습한 것은 아니다.

## 자료와 측정 범위

| 자료 | 선정 곡 | 분석 범위 |
|---|---:|---|
| [JAAH](https://github.com/MTG/JAAH) | 80 | 연구자 제공 `.lab` 시간 정렬 코드와 비트·박자·구조 주석 |
| [Weimar Jazz Database](https://jazzomat.hfm-weimar.de/download/download.html) | 13 | 솔로 음표·비트·화성·프레이즈·베이스 음 주석 |
| [SheetSage/Hooktheory](https://github.com/chrisdonahue/sheetsage-data) | 7 | 애시드·재즈 펑크·라틴 퓨전의 공개 선율·화성 발췌 |

JAAH 선정곡 22곡에는 같은 작곡의 Weimar 솔로 전사를 보조 자료로 연결했다. 서로 다른 연주이며, 선율과 JAAH 화성을 시간 정렬했다고 간주하지 않는다. 보조 선율의 코드톤·접근음 분석에는 해당 Weimar 연주의 화성을 쓴다.

100곡 중 41곡에 선율 자료가 있다. 알려진 화성 구간 14,015개, 선율 음표 21,289개를 분석했다. 화성 자료만 있는 곡의 선율·드럼·보이싱을 측정했다고 주장하지 않는다. 실제 드럼 타격 및 피아노 손 배치 통계는 이 자료에서 추출하지 않는다.

세부 묶음: 래그타임·스트라이드 4, 초기·뉴올리언스 8, 스윙 9, 빅밴드 18, 재즈 블루스 9, 비밥 8, 하드밥 8, 쿨 6, 모달 6, 포스트밥 1, 라틴·보사 4, 재즈 발라드 5, 퓨전 8, 애시드·재즈 펑크 6. 서로 겹치는 스타일을 포함하는 편집상의 분류이며 음원에서 자동 판별한 장르가 아니다. 애시드 묶음에는 재즈 펑크·디스코 접점이 포함된다. [Smithsonian 해설](https://folkways-media.si.edu/docs/folkways/artwork/SFW40820.pdf), [Jamiroquai 공식 소개](https://www.jamiroquai.com/music/), [Acid Jazz Records](https://acidjazz.co.uk/pages/about-acid-jazz)을 함께 참고했다.

## 계산과 엔진 반영

- 같은 화음을 연속해서 유지한 구간은 합친다. 무음·알 수 없는 코드 사이를 연결하거나 곡 끝에서 처음으로 가짜 전이를 만들지 않는다.
- 절대 조성 대신 화음 종류와 근음 이동 간격으로 2·3화음 전이를 집계한다. 코드 유지 길이와 확장음·전위 비율을 계산한다.
- 선율 전사에서는 음정, 음 길이, 마디 안의 시작 위치, 쉼, 코드 종류별 상대 음 분포, 화음 변경 시 가이드톤 도착, 반음 접근, 인클로저 빈도를 측정한다. 베이스 주석이 있을 때만 베이스 음정 이동을 집계한다. 인클로저는 자료의 통계이며 현재 엔진의 장식음 생성은 기존의 준비·해결 검증을 따른다.
- 곡별 분포를 정규화한 뒤 같은 곡 가중치로 평균한다. 긴 녹음이 다른 곡을 압도하지 않는다. 소수 표본은 약하게 반영하고, 선율 자료가 2곡 미만인 묶음은 선율 사전 분포로 사용하지 않는다.
- 재즈에서는 해당 세부장르 묶음이 주로 작동한다. 팝·R&B·시티팝·로파이·라틴 등에서는 선택한 장르·반주·Jazzy 정도에 따라 관련 묶음을 제한적으로 혼합한다. 화성 후보·3화음 문맥·화성 유지 길이·선율 음정·약박 리듬·음 밀도·장식음 비율·베이스 이동과 합주 후보 평가에 연결한다.
- 사용자가 지정한 코드 진행, 음역, 불협화음의 준비·해결, 악기 음역, 운지 및 드럼 동시타격 검증은 유지한다. 원곡 선율이나 전체 코드 진행을 재생산하는 방식이 아니다.

## 재즈 피아노 규칙

측정 통계와 별도로 교재의 연주 규칙을 구현했다. [Berklee의 피아노 보이싱](https://online.berklee.edu/takenote/basic-piano-voicing-techniques/), [모달·쿼털 화성](https://online.berklee.edu/takenote/harmonic-considerations-modal-harmony/), [Puget Sound의 가이드톤](https://musictheory.pugetsound.edu/mt21c/JazzChordVoicings.html)을 따른다.

셸·루트리스는 사용 가능한 3도·7도(6화음의 6도, sus의 4도)를 유지한다. 베이스가 없으면 피아노가 근음을 포함한다. 4도 및 전위된 4도 배치는 해당 코드의 허용음 안에서 만들고, 모달 화음의 열린 성격은 베이스가 받친다. 오른손 음역·간격을 제한한다. 스트라이드는 저음과 화음의 박을 분리하며 별도 베이스가 쉬는 구간에는 피아노가 저음 역할을 맡는다. 6·6/9·maj13·m11·altered dominant·sus 확장을 기존 조성 검사에 연결했다.

## 재현과 출처

목록: `jazz-selection.json`. 결과: `jazz-corpus.json` 및 `index.html`의 GAME_DATABASE. 분석기: `tools/analyze-jazz-corpus.cjs`.

```text
node tools/analyze-jazz-corpus.cjs <jazz-sources> <Hooktheory.json.gz>
```

입력 폴더에는 원본 `wjazzd.db`, JAAH `jaah/*.json`, 연구자가 제공한 `labs/labs/*.lab`이 필요하다. 파일별 SHA-256, 전사 식별자, 연주자, 데이터 종류와 분석 범위를 결과에 기록한다. 원본 DB와 Hooktheory 압축 파일은 해시를 확인한다.

Weimar에서 파생된 통계의 데이터 라이선스는 ODbL-1.0/DbCL-1.0이다. Hooktheory/SheetSage에서 파생된 통계는 CC BY-NC-SA 3.0이다. JAAH는 Eremenko, Demirel, Bozkurt, Serra의 ISMIR 2018 자료를 인용하며, 원본 주석의 권리는 해당 자료를 따른다. 전체 원본 주석과 녹음은 재배포하지 않는다.

검증: `tests/jazz-transfer-inst.test.cjs`. 인스트루멘털 체크 시 모든 구간의 탑라인 생성·배정·재생을 제외한다.
