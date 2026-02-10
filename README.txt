部署方式（最简单：GitHub Pages）
1) 新建一个 GitHub 仓库（例如 asakusa-omikuji）
2) 上传 index.html / app.js / sw.js / manifest.json
3) 仓库 Settings → Pages → Deploy from a branch → 选择 main / root
4) 等待生成 Pages 地址，用 iPhone Safari 打开
5) Safari → 分享 → 添加到主屏幕

说明
- 首次打开会从 DATA_URL 拉取 100 签中文数据，并缓存到手机本地；之后离线也能抽签。
- 随机性：使用 crypto.getRandomValues + rejection sampling，避免 modulo bias。
- 如遇到某些网络环境无法访问 raw.githubusercontent.com，可把 DATA_URL 改成你自己的镜像或把 JSON 内嵌进 app.js。
