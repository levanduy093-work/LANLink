# LANLink

LANLink là ứng dụng máy tính đa nền tảng viết bằng Electron phục vụ giao tiếp giữa hai máy tính trong cùng mạng LAN. Ứng dụng cho phép nhập thủ công IP của thiết bị đối tác, sử dụng Socket.IO để phối hợp thời gian thực, truyền tệp cục bộ theo dạng phân đoạn (chunked), Chart.js để hiển thị tốc độ truyền dữ liệu thời gian thực, và WebRTC cho các cuộc gọi thoại/video 1-đối-1.

## Kế hoạch Thiết kế UI/UX

LANLink được thiết kế trước khi triển khai dưới dạng một bảng điều khiển (dashboard) giao diện tối (dark theme) hiện đại nhằm phục vụ trình diễn dự án trường học. Giao diện luôn hiển thị trạng thái hoạt động trực quan, loại bỏ giao diện mặc định thô sơ của HTML, sử dụng phân tách rõ ràng giữa các phân vùng để lựa chọn IP cục bộ, kết nối thủ công thiết bị đối tác, nhắn tin, truyền tệp, biểu đồ, cuộc gọi và nhật ký hoạt động.

### 1. Phân tích UI/UX

- Người dùng mục tiêu: học sinh/sinh viên trình diễn giao tiếp LAN trên nhiều máy tính.
- Mục tiêu chính: nhanh chóng ghép nối hai thiết bị bằng IP, sau đó gửi tin nhắn, truyền tệp và bắt đầu cuộc gọi thoại/video 1-đối-1.
- Ưu tiên UX: hiển thị rõ trạng thái kết nối, lựa chọn đích truyền tải đơn giản, phản hồi tiến trình truyền tải cho từng thiết bị, nhật ký hệ thống thời gian thực dễ đọc, và bố cục hiển thị ổn định trên độ phân giải 1366x768 / 1920x1080.

### 2. Bố cục Tổng thể Ứng dụng

- Thanh bên trái (Sidebar): Danh sách IP mạng con/Wi-Fi cục bộ, ô nhập IP thiết bị đối tác, danh sách thiết bị đã ghép nối và lựa chọn mục tiêu truyền tải.
- Thanh trạng thái phía trên: Vai trò thiết bị, IP cục bộ, trạng thái kết nối, số lượng thiết bị trực tuyến, giá trị ping RTT trung bình.
- Không gian làm việc trung tâm: Khung trò chuyện văn bản và truyền tệp tin.
- Cột bên phải: Biểu đồ tốc độ truyền dữ liệu và khung cuộc gọi thoại/video.
- Phân vùng phía dưới: Nhật ký sự kiện thời gian thực kèm mốc thời gian.

### 3. Mô tả Wireframe

```text
+-------------+--------------------------------------------------+
| Danh sách   | Vai trò | IP | Kết nối | Trực tuyến | Ping Tb      |
| thiết bị    +-------------------------+------------------------+
|             | Trò chuyện văn bản      | Biểu đồ tốc độ         |
| chọn được   |                         +------------------------+
|             | Truyền tải tệp tin      | Cuộc gọi thoại/video   |
|             +--------------------------------------------------+
|             | Nhật ký sự kiện thời gian thực                  |
+-------------+--------------------------------------------------+
```

### 4. Hệ thống Thiết kế (Design System)

- Nền chính (Background): Màu than tối `#081018`.
- Phân vùng (Panels): Màu than chì `#101923`, `#13202c`, `#182737`.
- Đường viền (Borders): Xám xanh `#1d2b38` / `#263747`.
- Màu nhấn chính (Primary accent): Màu xanh lục lam (Cyan) `#22d3ee`.
- Màu nhấn phụ (Secondary accent): Màu tím (Violet) `#8b5cf6`.
- Thành công/Trực tuyến: Màu xanh lá cây `#35d07f`.
- Cảnh báo (Warning): Màu hổ phách `#f7b955`.
- Lỗi/Ngoại tuyến: Màu đỏ `#ff6577`.
- Bo góc (Radius): 9px cho các điều khiển, 12-14px cho thẻ (cards) và bảng điều khiển (panels).
- Hiệu ứng chuyển động (Motion): 140-160ms cho rê chuột (hover), lấy nét (focus), tiến trình và hiệu ứng lựa chọn.

### 5. Danh sách Thành phần (Components)

- Vỏ ứng dụng (App shell), thanh bên, thanh trạng thái trên cùng, tiêu đề phân vùng, thẻ thiết bị, nhãn vai trò, chấm trạng thái, nút nhấn, nút biểu tượng, bong bóng chat, bộ chọn tệp, mục tiến trình truyền tải, thanh tiến trình, phân vùng biểu đồ, ô hiển thị video, các nút điều khiển cuộc gọi, dòng log nhật ký.

### 6. Bảng màu (Color Palette)

- Nền chính: `#081018`.
- Bề mặt (Surface): `#101923`.
- Bề mặt nổi (Raised surface): `#13202c`.
- Bề mặt thẻ/input: `#182737`.
- Màu chữ chính: `#eef7ff`.
- Chữ mờ: `#8ea2b4`.
- Màu nhấn: `#22d3ee`.
- Màu vai trò nhấn tím: `#8b5cf6`.
- Màu xanh trực tuyến/thành công: `#35d07f`.
- Màu hổ phách cảnh báo: `#f7b955`.
- Màu đỏ ngoại tuyến/lỗi: `#ff6577`.

### 7. Typography (Phông chữ)

- Bộ phông chữ: Nhóm phông chữ không chân (sans-serif) hệ thống tương tự Inter.
- Tiêu đề ứng dụng: 21px, độ đậm 800-900.
- Tiêu đề phân vùng: 15px, độ đậm 800.
- Chữ phần thân/điều khiển: 13-14px, độ đậm 700-800 cho các điều khiển.
- Nhãn (Labels): 11-12px chữ in hoa, độ đậm lớn, màu chữ mờ.
- Nhật ký log: 12px monospace (phông chữ đơn cách).

### 8. Quy tắc Khoảng cách (Spacing)

- Tỷ lệ khoảng cách cơ sở: 4px.
- Khoảng cách lề ứng dụng: 10-14px.
- Khoảng đệm phân vùng (Padding): 14-16px.
- Khoảng cách giữa các thành phần (Gaps): 10-14px.
- Khoảng đệm hàng thiết bị/truyền tải: 9-12px.

### 9. Trạng thái của Nút bấm

- Nút chính (Primary): Dải màu xanh lục lam, chữ tối, bóng mờ xanh nhạt.
- Nút phụ (Secondary): Bề mặt nổi tối có đường viền.
- Nút nguy hiểm (Danger): Bề mặt pha sắc đỏ và đường viền đỏ.
- Rê chuột (Hover): Chuyển động nhẹ lên trên và tăng độ tương phản đường viền.
- Lấy nét (Focus): Đường viền ngoài màu xanh lục lam.
- Vô hiệu hóa (Disabled): Giảm độ mờ và không kích hoạt hiệu ứng chuyển động.

### 10. Trạng thái Trực tuyến/Ngoại tuyến

- Trực tuyến (Online): Chấm tròn xanh lá cây kèm hiệu ứng hào quang tỏa nhẹ, hiển thị đầy đủ, chọn được.
- Ngoại tuyến (Offline): Chấm tròn đỏ kèm hào quang đỏ mờ, độ mờ tăng, không chọn được.
- Đang chờ/Cảnh báo: Chữ trạng thái màu hổ phách.
- Đã kết nối/Thành công: Chữ trạng thái màu xanh lá cây.

### 11. Các thẻ Thành phần (Card Components)

- Các thẻ sử dụng bề mặt nổi tối, bo góc 12px, đường viền mảnh tinh tế, không gây rối mắt bởi nhiều thẻ lồng nhau.
- Thẻ được chọn sử dụng đường viền xanh lục lam và hiệu ứng tỏa sáng xanh nhẹ vào bên trong (glow).
- Thẻ thiết bị ngoại tuyến vẫn hiển thị nhưng được làm mờ đi.

### 12. Thiết kế Mục danh sách Thiết bị

- Hàng trên cùng: Chấm trạng thái xanh/đỏ, tên thiết bị, nhãn vai trò Máy chủ/Máy khách.
- Các hàng giữa: IP mạng LAN và ID thiết bị duy nhất.
- Hàng dưới cùng: Ping RTT và thời gian kết nối.
- Nhấp chọn để thiết lập hoặc hủy thiết lập đích truyền tải tới thiết bị trực tuyến đó.

### 13. Thiết kế Bong bóng Trò chuyện

- Tin nhắn đã gửi căn phải, nền màu pha sắc xanh lục lam.
- Tin nhắn nhận được căn trái, nền màu tối trung tính.
- Thông tin đi kèm: tên người gửi, danh sách thiết bị nhận và mốc thời gian.
- Nội dung tin nhắn được mã hóa thực thể HTML (escaped) trước khi hiển thị để bảo mật.

### 14. Thiết kế Mục Truyền tải Tệp tin

- Tiêu đề: tên tệp và nhãn trạng thái.
- Phần thân: thanh tiến trình truyền tải với dải màu chuyển từ xanh lục lam sang xanh lá.
- Phần chân: tên thiết bị nhận, phần trăm tiến trình, tốc độ truyền tải Mbps hiện tại và trung bình.

### 15. Thiết kế Thanh tiến trình (Progress Bar)

- Đường chạy nền: Màu xám xanh tối.
- Thanh tiến trình: Dải màu chuyển tiếp từ xanh lục lam sang xanh lá cây.
- Cập nhật tiến trình mượt mà không làm thay đổi chiều cao của hàng.
- Mỗi thiết bị nhận tệp sẽ có một hàng tiến trình riêng biệt.

### 16. Thiết kế Phân vùng Nhật ký Thời gian thực

- Bảng nhật ký cuộn được đặt ở dưới cùng với các log mới nhất hiển thị dưới cùng.
- Mốc thời gian đơn cách (monospace).
- Nhãn loại log sử dụng màu sắc tương ứng: info (xanh dương), success (xanh lá), warning (hổ phách), error (đỏ).
- Lưu giữ tối đa 160 dòng nhật ký mới nhất.

### 17. Thiết kế Khung Gọi thoại/Video

- Luồng camera của đối tác là khung lớn chính.
- Khung xem trước camera cục bộ hiển thị nhỏ ở góc dưới bên phải.
- Nút điều khiển gồm: Bắt đầu gọi, Kết thúc gọi, Bật/tắt micrô và Bật/tắt camera.
- Chấm trạng thái cuộc gọi chuyển đổi giữa rảnh/ngoại tuyến và đang hoạt động/kết nối.

### 18. Thiết kế Phân vùng Biểu đồ

- Biểu đồ đường (line chart) của Chart.js tích hợp ở cột bên phải.
- Trục X: thời gian.
- Trục Y: tốc độ Mbps.
- Đường vẽ màu xanh lục lam, phần tô nền mờ phía dưới, lưới đồ thị màu tối, loại bỏ chú giải thừa.
- Cập nhật tự động mỗi giây dựa trên dữ liệu đo tốc độ truyền tải thực tế.

## Kiến trúc Ứng dụng

```text
src/main.js
  Tiến trình chính của Electron (Main process)
  Khởi tạo máy chủ HTTP/Socket.IO nội bộ
  Quản lý kết nối thủ công IP đối tác
  Client kết nối Socket.IO tới thiết bị đối tác được chọn
  Vòng lặp ping kiểm tra RTT
  Điều phối và lưu trữ tin nhắn chat
  Điều phối truyền tệp phân đoạn và lưu tệp vào thư mục Downloads
  Truyền tín hiệu signaling cho WebRTC

src/preload.js
  Cầu nối IPC bảo mật giữa tiến trình giao diện (renderer) và tiến trình chính (main)

src/renderer/
  index.html
  styles.css
  renderer.js
  Giao diện Dashboard, chọn thiết bị đích, chat, thanh tiến trình truyền tải,
  biểu đồ tốc độ Chart.js, kiểm soát thiết bị WebRTC, nhật ký sự kiện
```

## Cấu trúc Thư mục

```text
LANLink/
  package.json
  README.md
  src/
    main.js
    preload.js
    renderer/
      index.html
      styles.css
      renderer.js
```

## Cài đặt

Cài đặt các thư viện cần thiết khi máy tính của bạn có kết nối Internet:

```bash
npm install
```

Sau khi cài đặt xong các thư viện phụ thuộc, quá trình sử dụng LANLink không yêu cầu kết nối Internet.

## Chạy Ứng dụng

```bash
npm start
```

Chạy lệnh tương tự trên máy tính thứ hai trong cùng mạng LAN.

## Thử nghiệm giữa hai máy tính

1. Kết nối cả hai máy tính vào cùng một mạng Wi-Fi hoặc mạng LAN Ethernet.
2. Chạy `npm start` trên cả hai máy tính.
3. Trên mỗi ứng dụng, chọn đúng IP LAN cục bộ tương ứng từ danh sách hiển thị mạng nếu máy tính có nhiều card mạng hoạt động.
4. Trên một máy tính, nhập IP LAN của máy tính kia vào ô `Kết nối IP thủ công`, rồi nhấn nút `Thêm/Kết nối`.
5. Đợi thiết bị xuất hiện trực tuyến trong danh sách `Thiết bị lân cận`. Ứng dụng sẽ tự động chọn thiết bị trực tuyến đó làm đích.
6. Gửi một tin nhắn văn bản để kiểm tra.
7. Chọn một tệp tin bất kỳ và nhấn `Truyền dữ liệu`. Tiến trình truyền tải và tốc độ Mbps sẽ được hiển thị thực tế.
8. Chọn thiết bị đang trực tuyến và nhấn nút `Gọi thiết bị` ở bảng gọi để bắt đầu cuộc gọi thoại/video.
9. Nếu kết nối bị gián đoạn sau khi thay đổi mạng Wi-Fi/Ethernet, vui lòng chọn lại IP cục bộ hoạt động chính xác, nhập IP đối tác và bấm kết nối lại.

Các tệp tin nhận được sẽ được lưu tự động vào thư mục:

```text
Downloads/LANLinkReceived/
```

## Khắc phục Sự cố Tường lửa và mạng LAN

- Cấp quyền cho ứng dụng Node.js hoặc Electron đi qua Tường lửa (Firewall) trên mỗi máy tính.
- Đảm bảo tất cả máy tính đều thuộc cùng một phân mạng con (subnet), ví dụ: `192.168.1.x`.
- Tắt các kết nối VPN trong quá trình trình diễn vì chúng làm thay đổi định tuyến mạng LAN hoặc chặn luồng dữ liệu nội bộ.
- Thiết lập hồ sơ mạng trên Windows là Private/Home, không để Public network.
- Xác nhận cổng TCP `32150` không bị chặn. Cổng này được sử dụng cho liên lạc phối hợp Socket.IO.
- Để buổi trình diễn ổn định nhất, hãy dùng hai máy tính và ghép nối trực tiếp thông qua nhập `IP cục bộ`.
- Nếu thiết bị không xuất hiện sau khi đổi mạng Wi-Fi/Ethernet, hãy chọn lại IP cục bộ hoạt động đúng trên ứng dụng và thực hiện kết nối lại.
- Nếu camera hoặc micrô không hoạt động, hãy kiểm tra quyền riêng tư của hệ điều hành dành cho ứng dụng Electron hoặc ứng dụng Terminal chạy nó.
- Nếu cuộc gọi WebRTC không thể kết nối, hãy kiểm tra tính năng gửi tin nhắn chat trước. Tiến trình kết nối WebRTC yêu cầu phối hợp qua Socket.IO, do đó kết nối chat văn bản phải thông suốt trước khi thực hiện gọi thoại/video.

## Ghi chú thêm

- Ứng dụng được tối ưu hóa tốt nhất cho một cặp kết nối 2 thiết bị ổn định.
- Tốc độ Ping RTT cập nhật mỗi 3 giây và được làm mượt để tránh dao động nhảy số liên tục.
- Tốc độ tệp tin được tính theo công thức: `Mbps = số bit đã truyền / thời gian đã trôi qua / 1,000,000`.
- WebRTC được thiết lập cho cuộc gọi 1-đối-1 trực tiếp và ổn định.
- Ứng dụng ưu tiên tính ổn định, tin cậy và sự rõ ràng của buổi trình diễn thực tế hơn là xử lý các trường hợp mạng phân tán phức tạp.
