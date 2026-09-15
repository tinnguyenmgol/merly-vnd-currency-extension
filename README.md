# Merly VND Currency Converter

Chrome/Edge extension dành cho Merly để quy đổi giá từ **VND** sang các thị trường Shopee xuyên biên giới và hỗ trợ nhập giá trực tiếp trên Shopee Seller.

## Thị trường hỗ trợ

- 🇲🇾 Malaysia — MYR
- 🇸🇬 Singapore — SGD
- 🇵🇭 Philippines — PHP
- 🇹🇭 Thailand — THB
- 🇹🇼 Taiwan — TWD

## v1.2.0 — Shopee Auto Fill

Khi mở trang `banhang.shopee.vn` hoặc `seller.shopee.vn`, extension sẽ:

1. Tự nhận diện ô **SKU Shop nội địa**.
2. Lấy giá VND của SKU đang sửa.
3. Tính MY/SG/PH/TH/TW theo tỷ giá hiện tại và hệ số Shopee đã cài.
4. Tự điền trực tiếp vào các ô **MY Giá / SG Giá / PH Giá / TH Giá / TW Giá**.
5. Dispatch đầy đủ `input` + `change` để Shopee nhận thay đổi.
6. Có nút **⚡ Điền ngay** để ép điền lại nếu cần.
7. Có công tắc **Tự điền giá 5 thị trường** để bật/tắt Auto Fill.

> Auto Fill chỉ thao tác các ô giá thị trường được nhận diện trong giao diện Shopee Seller. Extension không tự bấm nút Xác nhận/Cập nhật để bạn vẫn kiểm tra giá trước khi lưu.

## Popup quy đổi nhanh

- Nhập giá VND và xem 5 mức giá tương ứng.
- Copy từng giá.
- Bật/tắt **Giá Shopee điều chỉnh**.
- Cài % tăng/giảm riêng cho từng thị trường.
- Dùng tỷ giá live và cache khi API tạm thời lỗi.

## Cài đặt thủ công

1. Download/clone repository.
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked**.
5. Chọn thư mục repository.
6. Reload trang Shopee Seller.

## Cách dùng Auto Fill

- Mở sản phẩm Shopee Seller.
- Mở popup chỉnh giá một SKU/biến thể có các trường MY/SG/PH/TH/TW.
- Extension tự đọc **SKU Shop nội địa** và điền các thị trường.
- Kiểm tra lại giá rồi bấm **Xác nhận** trên Shopee.
- Nếu Shopee vừa render lại form, bấm **⚡ Điền ngay** trong bảng Merly Convert.

## File chính

- `manifest.json` — cấu hình Manifest V3.
- `background.js` — lấy/cache tỷ giá.
- `popup.html`, `popup.css`, `popup.js` — popup extension.
- `content.js`, `content.css` — Shopee helper + Auto Fill.
- `icons/` — icon extension.
