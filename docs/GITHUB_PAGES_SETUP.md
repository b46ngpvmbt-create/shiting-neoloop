# GitHub Pages 发布说明

这个仓库已经将可公开的静态演示放在 `docs/` 目录。发布无需上传真实数据，也不需要部署后端。

## 首次发布

1. 在 GitHub 创建仓库，建议命名为 `shiting-neoloop`。
2. 将本地目录提交并推送到 `main` 分支。
3. 打开仓库的 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **Deploy from a branch**。
5. 分支选 `main`，文件夹选 `/docs`，保存。
6. GitHub 完成构建后会显示公开网址；用无痕窗口打开一次，确认页面与公开边界说明正常。

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
[查看公开演示](https://YOUR_GITHUB_USERNAME.github.io/shiting-neoloop/) · [查看项目仓库](https://github.com/YOUR_GITHUB_USERNAME/shiting-neoloop)
```

把 `YOUR_GITHUB_USERNAME` 替换成自己的 GitHub 用户名。GitHub 官方说明见：[创建 GitHub Pages 站点](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) 与 [配置个人主页 README](https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme)。
