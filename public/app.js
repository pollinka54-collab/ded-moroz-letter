const elements = {
  form: document.querySelector("#letter-form"),
  childName: document.querySelector("#child-name"),
  nameError: document.querySelector("#child-name-error"),
  formStatus: document.querySelector("#form-status"),
  letterSheet: document.querySelector("#letter-sheet"),
  letterName: document.querySelector("#letter-name-overlay"),
  letterCaption: document.querySelector("#letter-caption"),
  previewTitle: document.querySelector("#preview-title"),
  resultActions: document.querySelector("#result-actions"),
  downloadButton: document.querySelector("#download-letter-button"),
  resetButton: document.querySelector("#reset-button"),
};

const LETTER_TEMPLATE_URL = new URL("./assets/letter-template.png", document.baseURI).href;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\p{Pd}\s'’]{0,23}$/u;
let readyName = "";

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeFileName(value) {
  return cleanName(value)
    .replace(/[^\p{L}\p{N}-]+/gu, "_")
    .replace(/^_+|_+$/g, "") || "ребёнок";
}

function validateName(name) {
  if (!name) return "Введите имя ребёнка.";
  if (!NAME_PATTERN.test(name)) return "Используйте только буквы, пробел, дефис или апостроф.";
  return "";
}

function setNameError(message = "") {
  elements.nameError.textContent = message;
  elements.childName.setAttribute("aria-invalid", message ? "true" : "false");
}

function setOverlayName(name) {
  const value = name || "Имя";
  elements.letterName.textContent = value;
  elements.letterName.classList.toggle("is-long", value.length > 14);
}

function invalidateReadyLetter() {
  if (!readyName) return;
  readyName = "";
  elements.resultActions.hidden = true;
  elements.letterSheet.dataset.state = "empty";
  elements.previewTitle.textContent = "Письмо для вашего ребёнка";
  elements.letterCaption.textContent = "Имя изменено — создайте письмо заново";
  elements.formStatus.classList.remove("is-success");
  elements.formStatus.textContent = "Проверьте новое имя и снова нажмите «Создать письмо».";
}

function handleNameInput() {
  invalidateReadyLetter();
  setNameError();
  setOverlayName(cleanName(elements.childName.value));
  if (!readyName && !elements.childName.value) {
    elements.letterCaption.textContent = "Введите имя слева — оно появится в письме";
    elements.formStatus.textContent = "";
  }
}

function createLetter(event) {
  event.preventDefault();
  const name = cleanName(elements.childName.value);
  const error = validateName(name);
  setNameError(error);
  elements.formStatus.classList.remove("is-success");

  if (error) {
    elements.formStatus.textContent = "Проверьте имя и попробуйте ещё раз.";
    elements.childName.focus();
    return;
  }

  elements.childName.value = name;
  readyName = name;
  setOverlayName(name);
  elements.letterSheet.dataset.state = "ready";
  elements.previewTitle.textContent = "Персональное письмо готово";
  elements.letterCaption.textContent = `Имя «${name}» подставлено в оригинальный шаблон`;
  elements.resultActions.hidden = false;
  elements.formStatus.textContent = `Готово — письмо для ребёнка по имени «${name}» можно скачать.`;
  elements.formStatus.classList.add("is-success");

  if (window.matchMedia("(max-width: 820px)").matches) {
    elements.letterSheet.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось загрузить шаблон письма."));
    image.src = source;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Не удалось подготовить PDF.")), type, quality);
  });
}

function shrinkFontToFit(context, text, maxWidth, initialSize) {
  let size = initialSize;
  while (size > 20) {
    context.font = `${size}px "Snell Roundhand", "Segoe Script", Georgia, serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function jpegToPdf(jpegBytes, imageWidth, imageHeight) {
  const encoder = new TextEncoder();
  const pageWidth = 595.276;
  const pageHeight = 841.89;
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects = [
    encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    concatBytes([
      encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
      jpegBytes,
      encoder.encode("\nendstream"),
    ]),
    encoder.encode(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`),
  ];

  const header = encoder.encode("%PDF-1.4\n");
  const chunks = [header];
  const offsets = [0];
  let position = header.length;

  objects.forEach((object, index) => {
    offsets[index + 1] = position;
    const prefix = encoder.encode(`${index + 1} 0 obj\n`);
    const suffix = encoder.encode("\nendobj\n");
    chunks.push(prefix, object, suffix);
    position += prefix.length + object.length + suffix.length;
  });

  const xrefOffset = position;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encoder.encode(xref));
  return concatBytes(chunks);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function downloadLetter() {
  if (!readyName) return;
  elements.downloadButton.disabled = true;
  elements.downloadButton.setAttribute("aria-busy", "true");

  try {
    const template = await loadImage(LETTER_TEMPLATE_URL);
    const canvas = document.createElement("canvas");
    canvas.width = template.naturalWidth;
    canvas.height = template.naturalHeight;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(template, 0, 0);

    const fieldX = canvas.width * 0.3596;
    const fieldY = canvas.height * 0.5178;
    const fieldWidth = canvas.width * 0.3193;
    const fieldHeight = canvas.height * 0.0416;

    context.fillStyle = "#fbf8f0";
    context.fillRect(fieldX - 2, fieldY - 2, fieldWidth + 4, fieldHeight + 4);
    context.strokeStyle = "#bd8d4a";
    context.lineWidth = Math.max(1, canvas.width / 850);
    context.beginPath();
    context.moveTo(fieldX, fieldY + fieldHeight - 2);
    context.lineTo(fieldX + fieldWidth, fieldY + fieldHeight - 2);
    context.stroke();

    const fontSize = shrinkFontToFit(context, readyName, fieldWidth * 0.9, canvas.width * 0.046);
    context.font = `${fontSize}px "Snell Roundhand", "Segoe Script", Georgia, serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#78404f";
    context.fillText(readyName, fieldX + fieldWidth / 2, fieldY + fieldHeight * 0.5);

    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.96);
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const pdfBytes = jpegToPdf(jpegBytes, canvas.width, canvas.height);
    downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `Письмо_от_Деда_Мороза_${safeFileName(readyName)}.pdf`);
    elements.formStatus.textContent = "PDF скачан. Его можно открыть и распечатать на листе A4.";
    elements.formStatus.classList.add("is-success");
  } catch (error) {
    elements.formStatus.textContent = error.message || "Не удалось подготовить PDF. Попробуйте ещё раз.";
    elements.formStatus.classList.remove("is-success");
  } finally {
    elements.downloadButton.disabled = false;
    elements.downloadButton.removeAttribute("aria-busy");
  }
}

function resetLetter() {
  readyName = "";
  elements.form.reset();
  setNameError();
  setOverlayName("");
  elements.letterSheet.dataset.state = "empty";
  elements.previewTitle.textContent = "Письмо для вашего ребёнка";
  elements.letterCaption.textContent = "Введите имя слева — оно появится в письме";
  elements.resultActions.hidden = true;
  elements.formStatus.textContent = "";
  elements.formStatus.classList.remove("is-success");
  elements.childName.focus();
  if (window.matchMedia("(max-width: 820px)").matches) {
    elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

elements.form.addEventListener("submit", createLetter);
elements.childName.addEventListener("input", handleNameInput);
elements.downloadButton.addEventListener("click", downloadLetter);
elements.resetButton.addEventListener("click", resetLetter);
