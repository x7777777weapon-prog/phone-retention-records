const STORAGE_KEY = "phone-retention-records-v1";

const sampleRecords = [
  {
    id: crypto.randomUUID(),
    phone: "13800000000",
    carrier: "中国移动",
    billingStartDate: todayDate(),
    validityDays: "180",
    expiryDate: nextDate(18),
    reminderDays: "7",
    reminderTime: "09:00",
    monthlyFee: "8",
    purpose: "银行卡验证",
    notes: "示例记录，可编辑或删除",
    createdAt: new Date().toISOString()
  }
];

let records = loadRecords();

const form = document.querySelector("#cardForm");
const recordId = document.querySelector("#recordId");
const phone = document.querySelector("#phone");
const carrier = document.querySelector("#carrier");
const billingStartDate = document.querySelector("#billingStartDate");
const validityDays = document.querySelector("#validityDays");
const expiryDate = document.querySelector("#expiryDate");
const reminderDays = document.querySelector("#reminderDays");
const reminderTime = document.querySelector("#reminderTime");
const monthlyFee = document.querySelector("#monthlyFee");
const purpose = document.querySelector("#purpose");
const notes = document.querySelector("#notes");
const recordsBody = document.querySelector("#recordsBody");
const emptyState = document.querySelector("#emptyState");
const formTitle = document.querySelector("#formTitle");
const submitButton = document.querySelector("#submitButton");
const cancelEdit = document.querySelector("#cancelEdit");
const searchInput = document.querySelector("#searchInput");
const statusFilter = document.querySelector("#statusFilter");
const exportButton = document.querySelector("#exportButton");
const importInput = document.querySelector("#importInput");
const reminderBanner = document.querySelector("#reminderBanner");
const reminderText = document.querySelector("#reminderText");
const notifyButton = document.querySelector("#notifyButton");
const nextCard = document.querySelector("#nextCard");
const nextCalendarButton = document.querySelector("#nextCalendarButton");
const nextDaysLeft = document.querySelector("#nextDaysLeft");
const nextPhone = document.querySelector("#nextPhone");
const nextMeta = document.querySelector("#nextMeta");
const nextStartDate = document.querySelector("#nextStartDate");
const nextValidityDays = document.querySelector("#nextValidityDays");
const nextExpiryDate = document.querySelector("#nextExpiryDate");
const nextReminderAt = document.querySelector("#nextReminderAt");

let nextRecordId = "";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

form.addEventListener("submit", saveRecord);
cancelEdit.addEventListener("click", resetForm);
searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);
exportButton.addEventListener("click", exportRecords);
importInput.addEventListener("change", importRecords);
billingStartDate.addEventListener("change", updateExpiryFromBilling);
validityDays.addEventListener("input", updateExpiryFromBilling);
expiryDate.addEventListener("change", updateValidityFromExpiry);
notifyButton.addEventListener("click", requestNotificationPermission);
nextCalendarButton.addEventListener("click", () => {
  if (nextRecordId) downloadCalendarReminder(nextRecordId);
});

render();
showStartupReminder();

function loadRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleRecords));
    return sampleRecords;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function saveRecord(event) {
  event.preventDefault();

  const data = {
    id: recordId.value || crypto.randomUUID(),
    phone: phone.value.trim(),
    carrier: carrier.value,
    billingStartDate: billingStartDate.value,
    validityDays: validityDays.value.trim(),
    expiryDate: expiryDate.value,
    reminderDays: reminderDays.value.trim() || "7",
    reminderTime: reminderTime.value || "09:00",
    monthlyFee: monthlyFee.value.trim(),
    purpose: purpose.value.trim(),
    notes: notes.value.trim(),
    createdAt: new Date().toISOString()
  };

  if (!data.phone || !data.billingStartDate || !data.validityDays || !data.expiryDate) return;

  const existingIndex = records.findIndex((item) => item.id === data.id);
  if (existingIndex >= 0) {
    data.createdAt = records[existingIndex].createdAt || data.createdAt;
    records[existingIndex] = data;
  } else {
    records.push(data);
  }

  persist();
  resetForm();
  render();
}

function render() {
  const filtered = getFilteredRecords();
  updateSummary();
  recordsBody.innerHTML = "";

  emptyState.classList.toggle("hidden", filtered.length > 0);

  for (const item of filtered) {
    const normalized = normalizeRecord(item);
    const status = getStatus(normalized.expiryDate);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span class="phone">${escapeHtml(normalized.phone)}</span>
        <span class="meta">${escapeHtml(normalized.notes || "")}</span>
      </td>
      <td>${escapeHtml(normalized.carrier || "")}</td>
      <td>${formatDate(normalized.billingStartDate)}</td>
      <td>${escapeHtml(normalized.validityDays || "-")}天</td>
      <td>${formatDate(normalized.expiryDate)}</td>
      <td><span class="status-pill ${status.className}">${status.label}</span></td>
      <td>${normalized.monthlyFee ? `¥${escapeHtml(normalized.monthlyFee)}` : "-"}</td>
      <td>${escapeHtml(normalized.purpose || "-")}</td>
      <td class="actions">
        <div class="row-actions">
          <button class="icon-button" type="button" title="编辑" aria-label="编辑" data-edit="${normalized.id}">✎</button>
          <button class="calendar-button" type="button" title="分享到 iPhone 日历" aria-label="分享到 iPhone 日历" data-calendar="${normalized.id}">日历</button>
          <button class="icon-button danger" type="button" title="删除" aria-label="删除" data-delete="${normalized.id}">×</button>
        </div>
      </td>
    `;
    recordsBody.appendChild(tr);
  }

  recordsBody.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editRecord(button.dataset.edit));
  });
  recordsBody.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord(button.dataset.delete));
  });
  recordsBody.querySelectorAll("[data-calendar]").forEach((button) => {
    button.addEventListener("click", () => downloadCalendarReminder(button.dataset.calendar));
  });
}

function getFilteredRecords() {
  const query = searchInput.value.trim().toLowerCase();
  const filter = statusFilter.value;

  return [...records]
    .map(normalizeRecord)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))
    .filter((item) => {
      const status = getStatus(item.expiryDate).key;
      const searchable = [item.phone, item.carrier, item.purpose, item.notes, item.monthlyFee, item.billingStartDate, item.expiryDate]
        .join(" ")
        .toLowerCase();
      return (filter === "all" || filter === status) && (!query || searchable.includes(query));
    });
}

function updateSummary() {
  const normalized = records.map(normalizeRecord);
  document.querySelector("#totalCount").textContent = normalized.length;
  document.querySelector("#soonCount").textContent = normalized.filter((item) => getStatus(item.expiryDate).key === "soon").length;
  document.querySelector("#expiredCount").textContent = normalized.filter((item) => getStatus(item.expiryDate).key === "expired").length;
  updateReminderBanner(normalized);
  updateNextCard(normalized);
}

function editRecord(id) {
  const item = records.find((record) => record.id === id);
  if (!item) return;

  recordId.value = item.id;
  phone.value = item.phone || "";
  carrier.value = item.carrier || "其他";
  billingStartDate.value = item.billingStartDate || item.expiryDate || "";
  validityDays.value = item.validityDays || calculateDays(item.billingStartDate || item.expiryDate, item.expiryDate) || "";
  expiryDate.value = item.expiryDate || calculateExpiry(item.billingStartDate, item.validityDays) || "";
  reminderDays.value = item.reminderDays || "7";
  reminderTime.value = item.reminderTime || "09:00";
  monthlyFee.value = item.monthlyFee || "";
  purpose.value = item.purpose || "";
  notes.value = item.notes || "";
  formTitle.textContent = "编辑记录";
  submitButton.textContent = "更新记录";
  cancelEdit.classList.remove("hidden");
  phone.focus();
}

function deleteRecord(id) {
  const item = records.find((record) => record.id === id);
  if (!item) return;

  const ok = confirm(`删除 ${item.phone} 的记录？`);
  if (!ok) return;

  records = records.filter((record) => record.id !== id);
  persist();
  render();
}

function resetForm() {
  form.reset();
  recordId.value = "";
  carrier.value = "中国移动";
  reminderDays.value = "7";
  reminderTime.value = "09:00";
  formTitle.textContent = "新增记录";
  submitButton.textContent = "保存记录";
  cancelEdit.classList.add("hidden");
}

function exportRecords() {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `电话卡保号记录-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importRecords(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("Invalid data");
      records = imported.map((item) => ({
        id: item.id || crypto.randomUUID(),
        phone: String(item.phone || ""),
        carrier: String(item.carrier || "其他"),
        billingStartDate: String(item.billingStartDate || item.expiryDate || ""),
        validityDays: String(item.validityDays || ""),
        expiryDate: String(item.expiryDate || ""),
        reminderDays: String(item.reminderDays || "7"),
        reminderTime: String(item.reminderTime || "09:00"),
        monthlyFee: String(item.monthlyFee || ""),
        purpose: String(item.purpose || ""),
        notes: String(item.notes || ""),
        createdAt: item.createdAt || new Date().toISOString()
      })).filter((item) => item.phone && item.expiryDate);
      persist();
      resetForm();
      render();
    } catch {
      alert("导入失败，请选择由本 App 导出的 JSON 文件。");
    } finally {
      importInput.value = "";
    }
  };
  reader.readAsText(file);
}

function updateExpiryFromBilling() {
  const calculated = calculateExpiry(billingStartDate.value, validityDays.value);
  if (calculated) expiryDate.value = calculated;
}

function updateValidityFromExpiry() {
  const calculated = calculateDays(billingStartDate.value, expiryDate.value);
  if (calculated) validityDays.value = calculated;
}

function updateReminderBanner(items) {
  const due = getDueReminders(items);
  reminderBanner.classList.toggle("hidden", due.length === 0);
  if (!due.length) return;

  const top = due.slice(0, 3).map((item) => {
    const status = getStatus(item.expiryDate);
    return `${item.phone} ${status.label}到期，${getReminderDateText(item)} ${item.reminderTime || "09:00"}提醒`;
  });
  const rest = due.length > 3 ? `，另有${due.length - 3}张` : "";
  reminderText.textContent = `${top.join("；")}${rest}`;
}

function updateNextCard(items) {
  const sorted = [...items]
    .filter((item) => item.phone && item.expiryDate)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  nextCard.classList.toggle("hidden", sorted.length === 0);
  if (!sorted.length) {
    nextRecordId = "";
    return;
  }

  const item = sorted[0];
  const status = getStatus(item.expiryDate);
  nextRecordId = item.id;
  nextDaysLeft.textContent = status.key === "expired" ? status.label : `剩余${status.label}`;
  nextPhone.textContent = item.phone;
  nextMeta.textContent = `${item.carrier || "其他"} · ${item.purpose || "未填写用途"}`;
  nextStartDate.textContent = formatDate(item.billingStartDate);
  nextValidityDays.textContent = `${item.validityDays || "-"}天`;
  nextExpiryDate.textContent = formatDate(item.expiryDate);
  nextReminderAt.textContent = `${getReminderDateText(item)} ${item.reminderTime || "09:00"}`;
}

function showStartupReminder() {
  const due = getDueReminders(records.map(normalizeRecord));
  if (!due.length) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  setTimeout(() => {
    const first = due[0];
    const status = getStatus(first.expiryDate);
    new Notification("电话卡保号提醒", {
      body: `${first.phone} ${status.label}到期，请确认是否需要续费。`
    });
  }, 800);
}

function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("当前浏览器不支持系统通知。");
    return;
  }

  Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      showStartupReminder();
      notifyButton.textContent = "通知已开启";
    } else {
      alert("通知没有开启，页面顶部仍会显示到期提醒。");
    }
  });
}

function getDueReminders(items) {
  return items.filter((item) => {
    const daysLeft = getDaysLeft(item.expiryDate);
    const remindBefore = Number.parseInt(item.reminderDays || "7", 10);
    return Number.isFinite(daysLeft) && daysLeft <= remindBefore;
  }).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
}

function normalizeRecord(item) {
  const billing = item.billingStartDate || item.expiryDate || "";
  const expiry = item.expiryDate || calculateExpiry(billing, item.validityDays) || "";
  const days = item.validityDays || calculateDays(billing, expiry) || "";
  return {
    ...item,
    billingStartDate: billing,
    validityDays: days,
    expiryDate: expiry,
    reminderDays: item.reminderDays || "7",
    reminderTime: item.reminderTime || "09:00"
  };
}

async function downloadCalendarReminder(id) {
  const item = normalizeRecord(records.find((record) => record.id === id) || {});
  if (!item.phone || !item.expiryDate) return;

  const reminderDate = getReminderDate(item);
  const start = calendarDateTime(reminderDate, item.reminderTime || "09:00");
  const endDate = new Date(start.date.getTime() + 30 * 60000);
  const title = `电话卡保号提醒 ${item.phone}`;
  const detail = [
    `手机号：${item.phone}`,
    `运营商：${item.carrier || "-"}`,
    `到期日：${formatDate(item.expiryDate)}`,
    `用途：${item.purpose || "-"}`,
    `备注：${item.notes || "-"}`
  ].join("\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Phone Retention Records//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${item.id || crypto.randomUUID()}@phone-retention-records`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${start.ics}`,
    `DTEND:${toIcsDate(endDate)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(detail)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(title)}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\\r\\n");

  const fileName = `电话卡提醒-${sanitizeFileName(item.phone)}.ics`;
  const file = new File([ics], fileName, { type: "text/calendar" });

  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        files: [file],
        title: "电话卡保号提醒",
        text: `${item.phone} 的保号日历提醒`
      });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }

  const encoded = encodeURIComponent(ics);
  const dataUrl = `data:text/calendar;charset=utf-8,${encoded}`;
  const win = window.open(dataUrl, "_blank");
  if (!win) {
    alert("请允许弹出窗口，或在 iPhone 上用 Safari 打开后再次点击“日历”。");
  }
}

function getReminderDate(item) {
  const date = new Date(`${item.expiryDate}T00:00:00`);
  const days = Number.parseInt(item.reminderDays || "0", 10);
  if (Number.isFinite(days)) date.setDate(date.getDate() - days);
  return date;
}

function getReminderDateText(item) {
  return dateToInputValue(getReminderDate(item));
}

function calendarDateTime(date, timeValue) {
  const [hour = "9", minute = "0"] = String(timeValue || "09:00").split(":");
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(hour), Number(minute), 0);
  return { date: local, ics: toIcsDate(local) };
}

function toIcsDate(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;
}

function escapeIcs(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function sanitizeFileName(value) {
  return String(value).replace(/[\\\\/:*?"<>|]/g, "-");
}

function getStatus(dateValue) {
  const days = getDaysLeft(dateValue);

  if (Number.isNaN(days)) {
    return { key: "safe", label: "-", className: "status-safe" };
  }
  if (days < 0) {
    return { key: "expired", label: `超${Math.abs(days)}天`, className: "status-expired" };
  }
  if (days <= 30) {
    return { key: "soon", label: `${days}天`, className: "status-soon" };
  }
  return { key: "safe", label: `${days}天`, className: "status-safe" };
}

function getDaysLeft(dateValue) {
  const today = startOfDay(new Date());
  const expiry = startOfDay(new Date(`${dateValue}T00:00:00`));
  return Math.ceil((expiry - today) / 86400000);
}

function calculateExpiry(startValue, daysValue) {
  const days = Number.parseInt(daysValue, 10);
  if (!startValue || !Number.isFinite(days) || days < 1) return "";

  const date = new Date(`${startValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days - 1);
  return dateToInputValue(date);
}

function calculateDays(startValue, expiryValue) {
  if (!startValue || !expiryValue) return "";
  const start = startOfDay(new Date(`${startValue}T00:00:00`));
  const expiry = startOfDay(new Date(`${expiryValue}T00:00:00`));
  const days = Math.floor((expiry - start) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? String(days) : "";
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateToInputValue(date);
}

function todayDate() {
  return dateToInputValue(new Date());
}

function dateToInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
