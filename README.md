# 🤖 Smart Form Autofill (Chrome Extension)

A powerful, modular, and multi-website Chrome Extension that fills registration forms automatically from Excel data. Built with **React**, **Vite**, and **Manifest V3**.

Whether it's a simple contact form, a complex government portal with dependent dropdowns, or a job application, this extension handles it safely and efficiently. **It never auto-submits a form.**

---

## ✨ Features

- **📊 Excel Data Import:** Upload `.xlsx` or `.xls` files (powered by SheetJS). Leading zeros in IDs and phone numbers are preserved.
- **🧠 Smart Field Mapping:** Uses a custom scoring algorithm to automatically match Excel columns to website fields based on labels, names, IDs, and placeholders.
- **🔗 Dependent Dropdowns Support:** Automatically waits and handles cascading dropdowns (e.g., selecting a Division reveals the correct Districts).
- **🎨 Select2 / Custom Dropdowns:** Built-in logic to interact with modern custom UI dropdowns, not just standard `<select>` tags.
- **📞 Smart Phone Number & Date Handling:** Automatically splits country codes from phone numbers and converts Excel date serial numbers (e.g., `38484`) into valid `YYYY-MM-DD` formats.
- **🖼️ Picture Preview System:** Upload multiple student/applicant photos at once. The extension displays the correct photo for the current record so you can manually upload it to the site.
- **🛡️ Exception Handling:** No more ugly browser `alert()` boxes. Errors are displayed gracefully inside the extension UI (Red Warning Box).
- **⏩ Batch Mode:** Process multiple records sequentially. The extension pauses for manual review before moving to the next person, ensuring zero cross-contamination of data.

---

## 🛠️ Installation (For Users)

1. **Download SheetJS:** The extension requires the SheetJS library, which is not bundled due to repository size limits. Download `xlsx.full.min.js` from [SheetJS CDN](https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js) and place it in `public/lib/`.
2. **Build the Project:** Run `npm install` and `npm run build`.
3. **Load in Chrome:**
   - Go to `chrome://extensions`.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked** and select the **`dist`** folder generated after building.
4. **Pin the Extension:** Click the puzzle icon in Chrome and pin "Smart Form Autofill".

---

## 🚀 How to Use

1. Click the extension icon to open the Side Panel.
2. **Students/Records Tab:** Upload your Excel file. Optionally, upload multiple profile pictures (named exactly as the record's Name in Excel).
3. **Setup Tab:** Click **Scan Page** to detect fields. Click **Suggest Mappings** and review the matches. If a match is wrong, fix it manually using the dropdowns, then click **Save Mappings**.
4. **Autofill Tab:** Click **Fill Current Record**. Review the filled data on the page.
5. **Submit:** Once satisfied, click **Submit Form on Page** (or manually submit). The extension will never submit without your permission.
6. **Batch Mode:** Click **Start Batch** to process records one by one. Review each, then click **Confirm Review → Next Record**.

---

## 🏗️ Architecture

The extension is built with a modular structure to ensure stability and scalability:

- **`manifest.json`**: MV3 configuration.
- **`background.js`**: Service worker for message routing.
- **`content.js`**: Injected into web pages to handle scanning, mapping, and DOM manipulation.
- **`shared/`**:
  - `storage.js`: Chrome storage API wrapper.
  - `matching.js`: Smart scoring algorithm for field matching.
  - `validation.js`: Date parsing and data validation.
  - `adapters/generic.js`: The core engine that interacts with standard and custom HTML inputs (including React-Select and Select2).

---

## ⚠️ Limitations

- **Browser Security:** For security reasons, extensions cannot automatically upload files (like profile pictures) from your local disk. The extension provides a preview so you can upload it manually with one click.
- **CAPTCHAs / OTPs:** The extension cannot bypass CAPTCHAs or authentication steps.
- **Cross-origin iframes:** The content script cannot access forms embedded in cross-origin iframes.

---
*Built with ❤️ for efficient form filling.*