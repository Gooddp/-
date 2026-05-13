# 每日日程表

这是一个纯前端多页面日程应用，入口是 `index.html`。页面使用 Supabase Auth 和 Supabase 数据表进行云端保存。

## 配置

1. 在 Supabase 项目中打开 SQL Editor，运行 `supabase-schema.sql`。
2. 在 `app.js` 顶部填入：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. 打开 `index.html`，使用邮箱和密码注册或登录。

## 页面

- `index.html`：月历主界面。
- `day.html?date=YYYY-MM-DD`：当天日程列表。
- `edit.html?date=YYYY-MM-DD`：新增日程。
- `edit.html?date=YYYY-MM-DD&id=UUID`：编辑日程。
- `reflection.html?date=YYYY-MM-DD`：每日感想。

## 宠物占位

右下角宠物入口使用 `assets/pet-placeholder.svg`，可以直接替换成同名图片，或在 `day.html` 里修改图片路径。
