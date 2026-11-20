# Xưởng dựng video

Công cụ sửa video Remotion bằng kéo thả, kiểu các app dựng phim quen thuộc: Claude dựng bản đầu, bạn tự chỉnh chữ, cắt ghép, thêm hiệu ứng ngay trên màn hình mà không phải ra lệnh từng chút.

## Chạy

```bash
cd xuong-dung-video
npm ci        # chỉ lần đầu
npm start     # mở http://localhost:3711
```

Cần Node 20 trở lên. Lần xuất video đầu tiên Remotion tự tải trình duyệt dựng hình của nó (một lần).

## Màn hình

| Vùng | Làm được gì |
| --- | --- |
| Trái: thư viện | **Nguồn** (nhập video, ảnh), **Âm thanh** (12 tiếng động có sẵn + nhạc, giọng đọc của bạn), **Chữ** (10 kiểu), **Hiệu ứng** (15 loại), **Cảnh** (nền màu). Bấm ＋ để đặt vào đầu phát, hoặc kéo xuống thanh thời gian. |
| Giữa: video | Bấm để chọn, kéo để dời, kéo chấm tròn ở góc để phóng to, **bấm đúp vào chữ để sửa ngay trên hình**. |
| Phải: thuộc tính | Nội dung, kiểu chữ, phông, cỡ, màu, chuyển động vào/ra, thời gian, tốc độ, âm lượng, vị trí, xoay, độ đậm. Khi không chọn gì: đổi tỉ lệ khung (9:16, 16:9, 1:1, 4:5). |
| Dưới: thanh thời gian | Kéo khối để dời (lên/xuống để đổi lớp), kéo mép để cắt ngắn/kéo dài, Tách, Nhân đôi, Xoá, thêm lớp, ẩn lớp, tắt tiếng. |

**Nam châm** (mặc định bật): lớp *Video chính* luôn liền mạch. Xoá hay cắt ngắn một đoạn thì phần sau tự dồn lên, chữ và tiếng động phía sau dời theo để vẫn khớp hình.

Phím tắt: `Phím cách` phát/dừng · `←` `→` từng khung (giữ Shift: 1 giây) · `Ctrl+B` tách · `Ctrl+D` nhân đôi · `Delete` xoá · `Ctrl+Z` / `Ctrl+Shift+Z` hoàn tác, làm lại · `Ctrl+C` / `Ctrl+V` chép, dán · `Enter` sửa chữ đang chọn · `Esc` xong.

Mọi thay đổi tự lưu. Bấm **Xuất video** để ra MP4 (H.264 + AAC) trong `xuat/`.

## Làm việc cùng Claude

Mỗi dự án là một tệp `du_an/<tên>.json`. Xưởng và Claude cùng sửa tệp này:

- Bạn chỉnh trong xưởng → tệp tự lưu.
- Claude sửa tệp → xưởng đang mở tự nạp lại sau khoảng 2 giây (hoàn tác được).

Câu lệnh gợi ý cho Claude: *"Dựng video từ `public/media/bai_quay.mp4` thành dự án `du_an/bai_anh_sang.json` cho Xưởng dựng video: mỗi câu phụ đề, nhãn, hiệu ứng, tiếng động là một khối riêng, đặt tên tiếng Việt."* Sau đó mở `http://localhost:3711/?du_an=bai_anh_sang` để tự chỉnh nốt.

Xuất không cần mở giao diện:

```bash
npm run render -- bai_anh_sang     # ra xuat/bai_anh_sang.mp4
```

### Cấu trúc tệp dự án

```jsonc
{
  "name": "bai_anh_sang", "width": 1080, "height": 1920, "fps": 30,
  "tracks": [                       // trên cùng trong danh sách = vẽ đè lên trên
    { "id": "t_phude", "name": "Phụ đề", "kind": "text" },
    { "id": "t_fx",    "name": "Hiệu ứng", "kind": "fx" },
    { "id": "t_chinh", "name": "Video chính", "kind": "main" },
    { "id": "t_sfx",   "name": "Tiếng động", "kind": "audio" }
  ],
  "items": [                        // start, dur tính bằng giây
    { "id": "v1", "track": "t_chinh", "type": "video", "name": "Bài quay", "src": "media/bai_quay.mp4",
      "start": 0, "dur": 12.5, "trim": 3.2, "srcDur": 58.5, "volume": 1, "fit": "cover" },
    { "id": "p1", "track": "t_phude", "type": "text", "name": "Phụ đề 1", "preset": "phude",
      "text": "Ánh sáng truyền theo đường thẳng", "start": 0.3, "dur": 2.8, "size": 54, "y": 600 },
    { "id": "e1", "track": "t_fx", "type": "effect", "name": "Phóng giật", "fx": "punch", "amount": 50, "start": 2, "dur": 0.6 },
    { "id": "s1", "track": "t_sfx", "type": "audio", "name": "Ting", "src": "sfx/ting.wav", "start": 2, "dur": 0.9 }
  ]
}
```

- Loại lớp (`kind`): `main`, `overlay` (nhận `video`, `image`, `solid`), `text`, `fx`, `audio`.
- Vị trí `x`, `y` tính bằng điểm ảnh của khung video, gốc ở **tâm** khung; `scale` 1 là cỡ gốc.
- Kiểu chữ (`preset`), hiệu ứng (`fx`), chuyển động (`animIn`, `animOut`), phông: xem `src/video/catalog.ts`.
- Tệp nguồn đặt trong `public/media/` (hoặc nhập qua mục Nguồn), tiếng động có sẵn ở `public/sfx/` (tự sinh khi chạy lần đầu).

## Mã nguồn

| Tệp | Việc |
| --- | --- |
| `src/model.ts` | Kiểu dữ liệu dự án |
| `src/video/MainVideo.tsx` | Khung dựng Remotion: biến tệp dự án thành hình và tiếng |
| `src/video/catalog.ts` | Danh mục phông, kiểu chữ, hiệu ứng, cảnh, tiếng động |
| `src/store.ts` | Trạng thái, hoàn tác, mọi thao tác trên thanh thời gian |
| `src/ui/*` | Thư viện, khung xem, bảng thuộc tính, thanh thời gian |
| `server/index.mjs` | Máy chủ: lưu dự án, nhập tệp, xuất video |
| `server/sfx.mjs` | Tự tổng hợp bộ tiếng động |

Muốn thêm kiểu chữ hay hiệu ứng mới: thêm một mục vào `catalog.ts` (hiệu ứng thì thêm một nhánh trong `useStageFx` của `MainVideo.tsx`).

Remotion miễn phí cho cá nhân và nhóm đến 3 người; tổ chức lớn hơn cần giấy phép của Remotion.
