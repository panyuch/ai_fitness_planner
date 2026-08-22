# 备份与恢复说明 (FitMeal)

本目录为 **求职作品集 Demo**，源码一旦丢失无法从线上恢复。请务必做版本管理 / 定期备份。

## 方式一：本地 Git（已初始化）

```bash
cd D:\working\fitness
git add -A
git commit -m "feat: 描述本次改动"
```

查看历史：`git log --oneline`

## 方式二：远程备份（推荐，防磁盘损坏）

```bash
git remote add origin <你的仓库地址>   # 如 GitHub / Gitee / 腾讯云开发者平台
git push -u origin main
```

## 方式三：压缩打包

```bash
# 排除依赖与构建产物
tar --exclude=node_modules --exclude=.next -czf fitmeal-backup-$(date +%Y%m%d).tar.gz -C D:/working fitness
```

## 恢复

- Git 仓库损坏：`git fsck --full` 检查；无法修复则从远程 `git clone` 重新拉取。
- 误删文件：`git checkout -- <文件>` 或 `git restore <文件>`。
- 本沙箱曾发生过跨会话源码误删（见 SPEC §13.6），**强烈建议每次大改动后提交并推送远程**。

> 注意：`.env` / `.env.local` 含 API 密钥，已被 `.gitignore` 排除，请勿手动 `git add` 这些文件。
