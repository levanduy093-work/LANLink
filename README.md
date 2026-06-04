# HỆ THỐNG TRUYỀN DẪN QUANG PON - ỨNG DỤNG TRUYỀN DỮ LIỆU & GIAO TIẾP NỘI BỘ

Dự án này là một ứng dụng máy tính đa nền tảng (Desktop Application) được thiết kế và tối ưu hóa để trình diễn, truyền dẫn dữ liệu và giao tiếp nội bộ trong mạng LAN phục vụ đề tài nghiên cứu: **"THIẾT KẾ MÔ HÌNH HỆ THỐNG TRUYỀN DẪN QUANG PON ỨNG DỤNG TRONG PHÒNG THỰC HÀNH"**.

Ứng dụng cho phép kết nối, nhắn tin thời gian thực, truyền tệp phân đoạn (chunked transfer) tốc độ cao, đo kiểm độ trễ đường truyền (Ping), hiển thị biểu đồ hiệu năng thời gian thực và hỗ trợ cuộc gọi thoại/video 1-đối-1 trực tiếp không cần Internet.

---

## 🛠️ Công nghệ Sử dụng (Technology Stack)

Dự án được xây dựng dựa trên sự kết hợp giữa các công nghệ phần mềm hiện đại và các giao thức mạng tiêu chuẩn:

1. **Khung ứng dụng (App Container):** 
   - **Electron:** Đóng gói ứng dụng web thành ứng dụng desktop gốc chạy độc lập trên Windows, macOS và Linux.
   - **Node.js:** Xử lý các tác vụ hệ thống ở backend (HTTP Server, UDP Socket, File I/O, Child Process, Database Access).

2. **Giao diện người dùng (Frontend):**
   - **HTML5 & CSS3 (Glassmorphism):** Thiết kế giao diện tối (Dark Mode) hiện đại, trực quan, sử dụng các biến CSS (CSS Variables) linh hoạt, hiệu ứng chuyển động mượt mà (transitions) phù hợp trình diễn trên các màn hình phòng thực hành.
   - **Vanilla JavaScript:** Đảm nhiệm toàn bộ logic xử lý giao diện, cập nhật DOM thời gian thực và quản lý trạng thái ứng dụng.
   - **Chart.js:** Vẽ biểu đồ hiệu năng, hiển thị tốc độ truyền dữ liệu thời gian thực theo thời gian thực (real-time telemetry).

3. **Giao tiếp & Truyền dữ liệu (Network & Communication Stack):**
   - **HTTP REST API:** Sử dụng để thực hiện bắt tay (handshake) và truyền tải dữ liệu tệp tin.
   - **Socket.IO (WebSockets):** Thiết lập kết nối kênh đôi thời gian thực để gửi nhận tin nhắn chat và truyền tín hiệu (signaling) phục vụ cuộc gọi.
   - **UDP Multicast:** Tự động phát sóng (broadcast) và phát hiện các thiết bị khác đang chạy ứng dụng trong cùng mạng LAN.

4. **Kết nối thời gian thực (Real-time P2P):**
   - **WebRTC (Web Real-Time Communication):** Thiết lập luồng truyền phát âm thanh/hình ảnh ngang hàng (P2P) trực tiếp giữa hai camera/micro mà không đi qua máy chủ trung gian.

5. **Cơ sở dữ liệu (Database Persistence):**
   - **SQLite3:** Lưu trữ cục bộ lịch sử trò chuyện (chat history) và nhật ký truyền tải tệp tin (transmission logs) trực tiếp trên máy của người dùng (`lanlink.db`).

6. **Chẩn đoán mạng (Diagnostics):**
   - **OS Ping Utility:** Tích hợp công cụ `ping` của hệ điều hành (macOS, Windows) thông qua module `child_process` của Node.js để gửi mặc định **4 gói tin** đo độ trễ khứ hồi (RTT) và tỷ lệ mất gói tin (packet loss).

---

## 📂 Kiến trúc Ứng dụng & Luồng Dữ liệu

```text
src/main.js
  ├── Tiến trình chính (Main Process - Node.js)
  ├── Khởi tạo HTTP Server (REST API) & Socket.IO Server
  ├── UDP Multicast: Tự động quét và phát sóng thiết bị
  ├── Vòng lặp ping nền kiểm tra trạng thái thiết bị lân cận
  ├── Giao tiếp SQLite3: Lưu trữ dữ liệu chat & lịch sử truyền tệp
  └── Child Process: Gọi lệnh ping của OS để đo độ trễ thủ công

src/preload.js
  └── Cầu nối IPC (Inter-Process Communication): Cung cấp API bảo mật từ Main Process cho Renderer Process

src/renderer/
  ├── index.html   : Cấu trúc giao diện Dashboard, các bảng điều khiển và popup
  ├── styles.css   : CSS variables, phong cách Glassmorphic tối và sơ đồ lưới (grid) responsive
  └── renderer.js  : Tiến trình giao diện (Renderer Process) xử lý tương tác người dùng,
                     biểu diễn đồ thị Chart.js, nhận luồng WebRTC và điều khiển gọi
```

---

## 📥 Hướng dẫn Cài đặt & Triển khai

### Yêu cầu hệ thống:
- Đã cài đặt **Node.js** (Khuyến nghị phiên bản LTS mới nhất - v20 hoặc v22).
- Máy tính có camera và micro (nếu muốn thử nghiệm cuộc gọi WebRTC).

### Các bước cài đặt:

1. **Tải mã nguồn và truy cập thư mục dự án:**
   ```bash
   cd LANLink
   ```

2. **Cài đặt các gói thư viện phụ thuộc (cần kết nối Internet):**
   ```bash
   npm install
   ```

3. **Rebuild module SQLite3 gốc (BẮT BUỘC):**
   Vì SQLite3 là một thư viện C/C++ gốc (native C++ addon), nó cần được biên dịch lại để tương thích chính xác với phiên bản Electron hiện tại và cấu trúc chip máy tính của bạn (đặc biệt quan trọng đối với máy macOS Apple Silicon M1/M2/M3 hoặc Windows x64):
   ```bash
   npx electron-builder install-app-deps
   ```
   *Sau bước này, ứng dụng có thể hoạt động hoàn toàn ngoại tuyến trong mạng LAN mà không cần Internet.*

---

## 🚀 Chạy và Đóng gói Ứng dụng

### 1. Khởi chạy chế độ phát triển (Development):
```bash
npm start
# hoặc
npm run dev
```

### 2. Đóng gói ứng dụng thành file cài đặt (Production Build):
Dự án được tích hợp sẵn file script đóng gói tự động `build.sh` cho hệ điều hành macOS.
Để thực hiện đóng gói:
```bash
chmod +x build.sh
./build.sh
```
Sau khi hoàn tất, thư mục `dist/` sẽ chứa các tệp đóng gói:
- **macOS:** File `.dmg` hoặc `.zip` cho cả hai kiến trúc Intel (`x64`) và Apple Silicon (`arm64`).
- **Windows:** File cài đặt NSIS `.exe` (`Setup 1.0.0.exe` kiến trúc `x64`).

---

## 💻 Hướng dẫn Thử nghiệm Thực tế (Demo Guide)

Để thực hiện báo cáo khóa luận/đồ án đạt kết quả trực quan nhất, chuẩn bị hai máy tính kết nối cùng một mạng LAN (hoặc kết nối qua cùng một điểm phát Wi-Fi):

1. **Khởi chạy ứng dụng:** Mở ứng dụng trên cả máy tính A và máy tính B.
2. **Chọn giao diện mạng (Network Interface):** Ở thanh bên trái, nếu máy tính của bạn có nhiều card mạng (Wi-Fi, Ethernet, Loopback), hãy click chọn đúng IP thuộc dải mạng LAN đang kết nối.
3. **Kết nối thiết bị:** 
   - Nhập IP LAN của máy tính B vào mục **"Kết nối IP thủ công"** trên máy tính A (ví dụ: `192.168.1.76`) rồi bấm nút `+`.
   - Thiết bị B sẽ xuất hiện trực tuyến tại danh sách **"Thiết bị lân cận"** trên màn hình máy A và tự động được chọn làm đích.
4. **Đo kiểm mạng (Ping Diagnostics):**
   - Chọn thiết bị đối tác, click nút **"Đo tốc độ (Ping)"**.
   - Hộp thoại đo kiểm sẽ xuất hiện, gửi tuần tự **4 gói tin** ping tới thiết bị đích và hiển thị kết quả trực tiếp lên dòng console.
   - Khi hoàn tất, hệ thống sẽ đưa ra thống kê: Số gói tin gửi/nhận/mất, RTT (Min/Max/Avg) và đánh giá chất lượng đường truyền (Excellent/Normal/Unstable).
5. **Truyền tệp & Nhắn tin:**
   - Qua tab **"Gửi văn bản"** để trò chuyện thời gian thực.
   - Qua tab **"Gửi tệp"**, chọn một file bất kỳ (dung lượng tùy ý) và nhấn **"Truyền dữ liệu"**. Theo dõi tốc độ truyền tải Mbps tăng dần và biểu đồ Chart.js cập nhật trực quan ở cột bên phải.
   - Các tệp tin nhận được sẽ được lưu tự động vào thư mục mặc định: `Downloads/PONReceived/`.
6. **Cuộc gọi thoại/video:**
   - Click nút **"Gọi thiết bị"** để bắt đầu cuộc gọi WebRTC P2P. Phía đối tác sẽ nhận được hộp thoại chấp nhận/từ chối cuộc gọi.

---

## ⚠️ Khắc phục Sự cố Tường lửa & Mạng LAN

- **Tường lửa (Firewall):** Khi chạy ứng dụng lần đầu tiên, hãy cấp quyền cho phép Node.js/Electron giao tiếp qua mạng **Private** (Hồ sơ mạng của Windows phải được đặt là Private/Home, không để Public).
- **Phân mạng (Subnet):** Đảm bảo cả hai máy tính nằm trong cùng một phân mạng con (ví dụ: cùng có IP bắt đầu bằng `192.168.1.x`).
- **VPN:** Tắt toàn bộ phần mềm VPN (như NordVPN, 1.1.1.1, OpenVPN) trước khi chạy vì VPN sẽ định tuyến lại dữ liệu mạng LAN và chặn các luồng phát hiện UDP Multicast.
- **Quyền truy cập Camera/Micro:** Trên macOS, hãy đảm bảo ứng dụng Terminal (hoặc ứng dụng đóng gói) đã được cấp quyền truy cập Camera và Microphone trong phần cài đặt bảo mật hệ thống (Security & Privacy).
- **Cổng kết nối:** Đảm bảo cổng TCP `53317` không bị chặn hoặc chiếm dụng bởi các dịch vụ khác.
