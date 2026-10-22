# AIOEH 메인 페이지와 블로그

GitHub Pages와 Jekyll로 운영하는 한국어 블로그입니다. 별도 프로그램을 설치하지 않아도 GitHub 웹 편집기에서 글을 작성할 수 있습니다.

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

## 도메인 연결

이 저장소는 `TonyNobleHam/AIOEH.github.io`입니다. `AIOEH.github.io`는 저장소 이름이며, 현재 계정에서 자동으로 `https://AIOEH.github.io` 주소를 만들지는 않습니다. 연결 전 블로그 임시 주소는 `https://tonynobleham.github.io/AIOEH.github.io/blog/`입니다.

개인 도메인 `oehnps.co.uk` 연결 시:

1. `_config.yml`의 `url`을 `"https://oehnps.co.uk"`, `baseurl`을 `""`로 설정합니다.
2. 저장소의 **Settings → Pages → Custom domain**에 `oehnps.co.uk`를 저장합니다. 루트 `CNAME` 파일에는 `oehnps.co.uk` 한 줄만 있어야 합니다.
3. Cloudflare DNS에서 GitHub Pages로 연결하고 DNS 확인 및 인증서 발급이 끝나면 **Enforce HTTPS**를 켭니다.

연결 후 홈페이지 주소는 `https://oehnps.co.uk/`, 블로그 주소는 `https://oehnps.co.uk/blog/`입니다. 도메인을 연결해도 저장소 이름은 그대로 유지합니다. `baseurl`은 연결 후에도 `/blog`가 아닌 빈 문자열로 유지하세요. 블로그 경로는 페이지와 글의 `permalink`로 지정되어 있습니다.

기존 `TonyNobleHam.github.io` 연구실 사이트와 별개인 저장소입니다. 이 블로그를 수정해도 기존 연구실 저장소의 파일은 바뀌지 않습니다.
