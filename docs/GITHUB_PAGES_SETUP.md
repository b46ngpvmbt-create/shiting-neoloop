# GitHub Pages 降级页发布说明

这个仓库在 `docs/` 目录保留了一套可公开、无需后端的旧版静态页。它是 Netlify 主站不可用时的功能缩减降级页，不包含当前完整六步交互和团队页，不能描述为主演示的同版备份。

正式交互演示：<https://shiting-neoloop-demo.netlify.app>

## 首次发布

1. 在 GitHub 创建仓库，建议命名为 `shiting-neoloop`。
2. 将本地目录提交并推送到 `main` 分支。
3. 打开仓库的 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **Deploy from a branch**。
5. 分支选 `main`，文件夹选 `/docs`，保存。
6. GitHub 完成构建后会显示公开网址；用无痕窗口打开一次，确认页面与公开边界说明正常，并明确标注“功能缩减降级页”。

## 发布前检查

- 不上传成员手机号、身份证明、报名表原件、授权文件或赛事后台截图；
- 不上传新石器内部资料、飞书内容、真实数据导出或任何可回溯个人/车辆的信息；
- 不使用“已上线”“已接入”“真实成效”等无法证明的表述；
- 站点中的 `DEMO-C-*`、任务号、时长和问题描述均应保留为合成样例；
- 若赛事条款限制公开展示，先改为私有仓库或只分享给评审指定账号。

## 个人主页放置方式

个人 GitHub 主页可创建一个与用户名完全相同的公开仓库，并在其 `README.md` 中增加：

```md
### 石听 NeoLoop

面向无人配送服务反馈闭环的协同方案。  
[查看正式交互演示](https://shiting-neoloop-demo.netlify.app/) · [查看项目仓库](https://github.com/YOUR_GITHUB_USERNAME/shiting-neoloop)
```

把 `YOUR_GITHUB_USERNAME` 替换成自己的 GitHub 用户名。GitHub 官方说明见：[创建 GitHub Pages 站点](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) 与 [配置个人主页 README](https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme)。
