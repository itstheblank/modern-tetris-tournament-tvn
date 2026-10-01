# Tetris Tournament Backend

Đây là hệ thống Backend (kèm giao diện quản lý Frontend) dành cho việc tổ chức giải đấu Tetris. Hệ thống được xây dựng bằng **Node.js, Express, TypeScript, Prisma ORM và PostgreSQL**.

---

## 🚀 Hướng dẫn cài đặt và chạy trên máy mới

Để chạy được dự án này trên máy của bạn, hãy làm lần lượt theo các bước dưới đây:

### Bước 1: Cài đặt phần mềm yêu cầu (Prerequisites)
Đảm bảo máy tính của bạn đã cài đặt 2 phần mềm sau:
1. **Node.js** (Phiên bản 18 trở lên): [Tải tại đây](https://nodejs.org/)
2. **PostgreSQL**: [Tải tại đây](https://www.postgresql.org/download/) (Hoặc có thể dùng Docker, hoặc Database đám mây như Supabase/Neon tuỳ thích).

### Bước 2: Cài đặt thư viện
Mở Terminal / Command Prompt tại thư mục chứa code này và chạy lệnh:
```bash
npm install
```

### Bước 3: Cấu hình Database
1. Tạo một file mới tên là `.env` nằm ở thư mục gốc của dự án (ngang hàng với `package.json`).
2. Mở file `.env` và thêm chuỗi kết nối Database PostgreSQL của bạn vào:
```env
# Thay đổi username, password và port cho đúng với Postgres trên máy bạn
DATABASE_URL="postgresql://postgres:password123@localhost:5432/tetris_db?schema=public"
PORT=3000
```
*(Nếu database `tetris_db` chưa tồn tại, hãy dùng PgAdmin hoặc DBeaver để tạo một database trống tên là `tetris_db` trước).*

### Bước 4: Đồng bộ Cấu trúc Database (Prisma)
Để tạo các bảng (Tables) tự động vào trong Database vừa tạo, hãy chạy lệnh:
```bash
npx prisma db push
```
*(Sau lệnh này, Prisma sẽ tự động đẩy toàn bộ cấu trúc Schema vào PostgreSQL của bạn).*

### Bước 5: Khởi động Server
Bây giờ mọi thứ đã sẵn sàng. Bạn chạy lệnh sau để bật Server:
```bash
npm run dev
```
Khi Terminal hiện dòng chữ `Server Backend is running at: http://localhost:3000` là thành công!

---

## 🎮 Cách sử dụng
Mở trình duyệt Web và truy cập vào địa chỉ: **[http://localhost:3000](http://localhost:3000)** để sử dụng Giao diện Quản lý giải đấu. 

**Hoặc test API qua file mẫu:**
Bạn có thể cài đặt Extension **REST Client** trên VSCode và mở file `api-templates.http` có sẵn trong thư mục để bấm test thử các đường dẫn API.
