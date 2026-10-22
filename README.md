# AIOEH 메인 페이지와 블로그

GitHub Pages와 Jekyll로 운영하는 한국어 블로그입니다. 별도 프로그램을 설치하지 않아도 GitHub 웹 편집기에서 글을 작성할 수 있습니다.

- 메인 페이지: [oehnps.co.uk](https://oehnps.co.uk/)
- 블로그: [oehnps.co.uk/blog/](https://oehnps.co.uk/blog/)
- MSDS 분석: [msds.oehnps.co.uk](https://msds.oehnps.co.uk/) — 접근 권한이 있는 계정으로 로그인합니다.

## Pages CMS로 쉽게 글쓰기

[Pages CMS 글쓰기 화면](https://app.pagescms.org/tonynobleham/aioeh.github.io/main/collection/posts)을 엽니다. 블로그 맨 아래의 **글쓰기 ↗** 링크로도 들어갈 수 있습니다. 로그인이 필요하면 GitHub로 로그인하세요.

1. **Add an entry (새 글)**를 선택합니다.
2. **제목**과 **본문**을 작성합니다. **짧은 소개**는 선택 사항이며, **발행일**은 오늘 날짜로 시작합니다.
3. 사진을 넣으려면 본문에서 새 줄에 `/`를 입력하고 **Image → Upload**를 누릅니다. 사진 파일을 고른 뒤 **Select**를 누르면 본문에 들어갑니다. **사진** 메뉴에 올려 둔 파일도 선택할 수 있습니다.
4. **블로그에 공개**를 켜고 **Save (저장)**를 누릅니다. GitHub Pages가 다시 배포한 뒤 블로그에 나타납니다.

파일 이름은 자동으로 생성되므로 직접 입력하지 않아도 됩니다. 사진은 `assets/images`에 저장되고 본문에서는 `/assets/images/사진파일` 주소로 연결됩니다. 기존 글은 **블로그 글** 목록에서 열어 수정하고 저장합니다.

처음에는 **블로그에 공개**가 꺼져 있습니다. 이 상태로 저장하면 블로그에는 표시되지 않지만, 저장소가 공개이므로 글과 사진 자체는 GitHub에서 읽을 수 있습니다. 비공개 초안이나 개인정보는 저장하지 마세요. 미래 날짜를 지정해도 자동 예약 발행되지는 않으며, 해당 날짜 이후 다시 저장해야 합니다.

Pages CMS의 GitHub App은 **Only select repositories → AIOEH.github.io** 한 개에만 연결합니다. 글쓰기 설정은 루트 `.pages.yml`에서 관리합니다.

## 새 글 쓰기

1. [새 글 작성 화면](https://github.com/TonyNobleHam/AIOEH.github.io/new/main/_posts)을 엽니다.
2. 파일 이름을 `YYYY-MM-DD-english-slug.md` 형식으로 정합니다. 예: `2026-10-22-first-note.md`. 날짜는 발행일, 영문 부분은 글 주소가 됩니다. 같은 영문 부분을 중복해서 사용하지 마세요.
3. 아래 내용을 붙여 넣고 제목, 소개, 본문을 본인의 글로 바꿉니다.
4. 오른쪽 위 **Commit changes…**를 누르고 `main` 브랜치에 저장합니다. GitHub Pages가 자동으로 사이트를 다시 만듭니다. 보통 몇 분 후 반영됩니다.

```markdown
---
title: "글 제목"
description: "이 글을 소개하는 한 문장."
categories: [기록]
tags: [메모]
published: true
---

여기에 첫 문단을 씁니다.

<!--more-->

## 소제목

여기에 나머지 내용을 씁니다.
```

`description`, `categories`, `tags`는 필요 없으면 해당 줄 전체를 지워도 됩니다. 제목의 따옴표는 유지하세요. 파일 날짜가 아직 오지 않았다면 기본 설정에서 발행되지 않으며, 해당 날짜 이후 새 빌드가 필요합니다. 글 주소는 `/blog/posts/english-slug/` 형식입니다.

`<!--more-->` 위 내용이 글 목록의 요약으로 사용됩니다. `description`을 적으면 목록에서는 그 문장을 우선 표시합니다.

## 글 수정과 초안

- 기존 글은 [`_posts` 폴더](https://github.com/TonyNobleHam/AIOEH.github.io/tree/main/_posts)에서 파일을 열고 연필 아이콘으로 수정한 후 저장합니다.
- [`_drafts/example.md`](https://github.com/TonyNobleHam/AIOEH.github.io/blob/main/_drafts/example.md)에 글쓰기 예시가 있습니다. `_drafts` 파일은 블로그에 자동 발행되지 않습니다.
- 이 저장소는 공개입니다. 초안도 GitHub에서 읽을 수 있으므로 비공개 메모나 개인정보를 저장하지 마세요. 발행 전 비공개 초안은 개인 문서에서 작성하세요.
- 글을 발행하려면 `_posts/발행일-영문주소.md`로 저장합니다. 예시 파일은 자동 발행하지 마세요.

## 사진 넣기

1. [사진 업로드 화면](https://github.com/TonyNobleHam/AIOEH.github.io/upload/main/assets/images)을 열어 사진을 올리고 **Commit changes**로 저장합니다.
2. 글에 다음을 넣고 파일명과 설명을 바꿉니다.

```liquid
![사진 설명]({{ '/assets/images/photo.jpg' | relative_url }})
```

`relative_url`은 GitHub 임시 주소와 개인 도메인 양쪽에서 이미지 경로가 맞도록 합니다. 사진을 올릴 때 파일명은 간단한 영문과 숫자를 권장합니다.

## 사이트 설정

- 이름과 설명: `_config.yml`의 `title`, `description`
- 홈페이지 문구: `index.html`
- 메인 페이지의 서비스 이름·설명·주소: `_data/services.yml`
- 블로그 첫 화면 문구: `blog/index.html`
- 색상과 글꼴: `assets/style.css`
- 메뉴와 하단 문구: `_layouts/default.html`
- 블로그: `/blog/`
- 모든 글 목록: `/blog/archive/`
- RSS 피드: `/blog/feed.xml`

GitHub 저장소의 **Settings → Pages → Build and deployment**는 **Deploy from a branch**, 브랜치 **main**, 폴더 **/ (root)**를 사용합니다. 글 저장 후 **Actions**에서 Pages 빌드 결과를 확인할 수 있습니다.

## 도메인 운영 설정

이 저장소는 `TonyNobleHam/AIOEH.github.io`입니다. `AIOEH.github.io`는 저장소 이름이며, 사이트의 공개 주소는 `oehnps.co.uk`입니다.

- `_config.yml`: `url: "https://oehnps.co.uk"`, `baseurl: ""`
- **Settings → Pages → Custom domain**: `oehnps.co.uk`
- 루트 `CNAME` 파일: `oehnps.co.uk` 한 줄
- Cloudflare DNS: 아래 네 개의 `A` 레코드, 이름은 모두 `@` (`oehnps.co.uk`), 프록시 상태는 **DNS only**

| 유형 | 이름 | IPv4 주소 |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

`baseurl`은 빈 문자열로 유지하세요. 블로그의 `/blog/` 경로는 페이지와 글의 `permalink`로 지정되어 있습니다. 인증서 발급 및 **Enforce HTTPS** 상태는 **Settings → Pages**에서 확인할 수 있습니다.

`msds.oehnps.co.uk`는 별도의 MSDS 서비스입니다. 메인 페이지에서 해당 서비스로 연결하며, MSDS의 DNS·터널·접근 권한 설정은 이 블로그와 별도로 관리합니다.

기존 `TonyNobleHam.github.io` 연구실 사이트와 별개인 저장소입니다. 이 블로그를 수정해도 기존 연구실 저장소의 파일은 바뀌지 않습니다.

## 블로그 통계 보기와 운영

[블로그 인사이트](https://insights.oehnps.co.uk/)를 열거나 블로그 하단의 **통계**를 누릅니다. Cloudflare Access에서 지정된 관리자 이메일로 로그인합니다. 통계 화면과 조회 API는 관리자 인증 후에만 접근할 수 있습니다.

1. **오늘·어제·7일·30일·90일**을 고르거나 시작일과 종료일을 지정한 뒤 **조회**를 누릅니다. 날짜는 한국 시간이며, 한 번에 최대 366일을 조회합니다. 주요 지표는 바로 앞의 같은 길이 기간과 비교합니다.
2. **유입·기기**를 선택하거나 콘텐츠 목록의 **글 제목**을 눌러 분석 범위를 좁힙니다. 글 목록은 제목 검색과 지표별 정렬을 지원하며, **필터 초기화**로 전체 통계로 돌아갑니다.
3. 조회수·방문자·활성 읽기 시간·완독률, 유입 사이트와 UTM 캠페인, 국가·브라우저·시간대, 익명 읽기 여정을 확인합니다. **CSV 내려받기**는 현재 기간과 필터가 적용된 데이터를 저장합니다. 최근 방문은 **새로고침**으로 다시 조회합니다.

통계는 **수집에 동의한 익명 방문**만 포함합니다. 설치 이전 기록은 복원되지 않으며, 추적 차단이나 동의하지 않은 방문은 집계되지 않습니다. 익명 ID는 이름이나 실제 신원이 아니며, 기기·브라우저가 달라지거나 저장소를 지우면 같은 사람도 다르게 구분될 수 있습니다. 읽기 시간은 화면이 활성 상태이고 사용자 활동이 확인된 시간으로 측정하며, 탭을 열어둔 시간이나 내용을 이해한 정도를 뜻하지 않습니다. 상세 정의와 비교 기간의 제한은 [통계 집계 기준](analytics-worker/METRICS.md)을 참고하세요.

수집 데이터는 최대 **395일** 보관합니다. 글·사진·블로그 화면은 기존처럼 GitHub Pages에서 배포하지만, 통계 서버와 관리자 화면은 `analytics-worker/`의 **Cloudflare Worker를 별도로 배포**해야 반영됩니다. GitHub에 파일을 저장하는 것만으로 Worker가 갱신되지는 않습니다. 관리자 접근 정책, D1 저장소와 보관 설정도 Cloudflare에서 관리합니다. `COLLECTION_STARTED_AT`은 최초 수집 시작 시각이므로 재배포할 때 현재 시각으로 바꾸지 마세요.

`?demo=1`로 여는 화면은 표시된 것처럼 **예시 데이터 미리보기**이며 실제 방문 통계가 아닙니다. 운영 확인은 기본 주소에서 진행하세요.

배포용 `analytics-worker/wrangler.jsonc`는 공개 저장소에서 제외합니다. 새 환경에서는 `wrangler.example.jsonc`를 복사해 계정·D1·Access 설정을 채우세요. 관리자 이메일과 인증 설정, 로그인 정보는 공개 저장소에 올리지 않습니다.
