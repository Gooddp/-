(function () {
  const SUPABASE_URL = "https://wxxexialzfgywrtptwiy.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_IegYQawFaD-toJTSfhAOeA_OENDkoKU";

  const CATEGORY_CLASSES = {
    "学习": "study",
    "工作": "work",
    "生活": "life",
    "其他": "other"
  };

  const STATUS_LABELS = {
    todo: "待办",
    done: "已完成"
  };

  const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

  let supabaseClient = null;
  let currentSession = null;
  let authListenerReady = false;
  let activeMonth = null;
  let calendarRenderId = 0;

  document.addEventListener("DOMContentLoaded", initApp);

  async function initApp() {
    bindAuthForms();
    setConfigNotice();

    if (hasCloudConfig()) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await supabaseClient.auth.getSession();
      if (!error) {
        currentSession = data.session;
      }
      bindAuthListener();
    }

    updateAuthGate();
    await runCurrentPage();
  }

  function hasCloudConfig() {
    const hasValues = SUPABASE_URL.startsWith("https://") &&
      !SUPABASE_URL.includes("YOUR_") &&
      SUPABASE_ANON_KEY.length > 20 &&
      !SUPABASE_ANON_KEY.includes("YOUR_");

    return Boolean(hasValues && window.supabase && window.supabase.createClient);
  }

  function setConfigNotice() {
    const notice = document.querySelector("[data-config-notice]");
    if (!notice) return;

    const reason = notice.querySelector("[data-config-reason]");
    if (hasCloudConfig()) {
      notice.hidden = true;
      return;
    }

    notice.hidden = false;
    if (!window.supabase || !window.supabase.createClient) {
      reason.textContent = "当前未能加载 Supabase CDN，或者配置仍是占位值；页面会以预览模式显示，但不能保存。";
    } else {
      reason.textContent = "当前配置仍是占位值；页面会以预览模式显示，但不能保存。";
    }
  }

  function bindAuthListener() {
    if (authListenerReady || !supabaseClient) return;
    authListenerReady = true;
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") return;
      currentSession = session;
      updateAuthGate();
      await runCurrentPage();
    });
  }

  function bindAuthForms() {
    document.querySelectorAll("[data-auth-form]").forEach((form) => {
      if (form.dataset.bound === "true") return;
      form.dataset.bound = "true";

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await handleAuth(form, "signin");
      });

      const signupButton = form.querySelector('[data-auth-action="signup"]');
      signupButton?.addEventListener("click", async () => {
        await handleAuth(form, "signup");
      });
    });

    document.querySelectorAll("[data-sign-out]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", async () => {
        if (!supabaseClient) return;
        await supabaseClient.auth.signOut();
      });
    });
  }

  async function handleAuth(form, mode) {
    const message = form.querySelector("[data-auth-message]");
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    setMessage(message, "正在处理...", "");

    if (!supabaseClient) {
      setMessage(message, "请先填写 Supabase 配置。", "error");
      return;
    }

    const result = mode === "signup"
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(message, result.error.message, "error");
      return;
    }

    setMessage(message, mode === "signup" ? "注册成功，请按项目邮箱设置完成验证后登录。" : "登录成功。", "success");
  }

  function updateAuthGate() {
    const configured = Boolean(supabaseClient);
    const signedIn = Boolean(currentSession?.user);

    document.querySelectorAll("[data-auth-gate]").forEach((el) => {
      el.hidden = !configured || signedIn;
    });

    document.querySelectorAll("[data-app-content]").forEach((el) => {
      el.hidden = configured && !signedIn;
    });

    document.querySelectorAll("[data-user-menu]").forEach((el) => {
      el.hidden = !signedIn;
      const emailSlot = el.querySelector("[data-user-email]");
      if (emailSlot) emailSlot.textContent = currentSession?.user?.email || "";
    });
  }

  async function runCurrentPage() {
    const page = document.body.dataset.page;
    if (page === "calendar") await initCalendarPage();
    if (page === "day") await initDayPage();
    if (page === "edit") await initEditPage();
    if (page === "reflection") await initReflectionPage();
  }

  async function initCalendarPage() {
    const grid = document.querySelector("[data-calendar-grid]");
    if (!grid) return;

    if (!activeMonth) {
      activeMonth = getInitialMonth();
    }

    bindOnce("[data-prev-month]", "click", async () => {
      activeMonth = addMonths(activeMonth, -1);
      updateMonthUrl(activeMonth);
      await renderCalendar();
    });

    bindOnce("[data-next-month]", "click", async () => {
      activeMonth = addMonths(activeMonth, 1);
      updateMonthUrl(activeMonth);
      await renderCalendar();
    });

    bindOnce("[data-today-month]", "click", async () => {
      activeMonth = startOfMonth(new Date());
      updateMonthUrl(activeMonth);
      await renderCalendar();
    });

    await renderCalendar();
  }

  async function renderCalendar() {
    const grid = document.querySelector("[data-calendar-grid]");
    const title = document.querySelector("[data-month-title]");
    const summary = document.querySelector("[data-month-summary]");
    if (!grid || !title || !summary) return;

    const renderId = ++calendarRenderId;
    const monthToRender = new Date(activeMonth);
    title.textContent = `${monthToRender.getFullYear()}年${monthToRender.getMonth() + 1}月`;

    let counts = new Map();
    if (canUseCloud()) {
      summary.textContent = "正在读取云端日程...";
      try {
        counts = await fetchMonthCounts(monthToRender);
        if (renderId !== calendarRenderId) return;
        const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
        summary.textContent = total ? `本月共有 ${total} 项日程。` : "这个月还没有日程。";
      } catch (error) {
        if (renderId !== calendarRenderId) return;
        summary.textContent = "读取日程失败，请稍后重试。";
        console.error(error);
      }
    } else {
      summary.textContent = "预览模式：配置 Supabase 并登录后显示云端日程数量。";
    }

    if (renderId !== calendarRenderId) return;

    const fragment = document.createDocumentFragment();
    WEEKDAYS.forEach((day) => {
      const weekday = document.createElement("div");
      weekday.className = "weekday";
      weekday.textContent = day;
      fragment.appendChild(weekday);
    });

    const first = startOfMonth(monthToRender);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const leadingBlanks = (first.getDay() + 6) % 7;

    for (let i = 0; i < leadingBlanks; i += 1) {
      const blank = document.createElement("div");
      blank.className = "blank-cell";
      fragment.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const dateKey = formatDate(date);
      const count = counts.get(dateKey) || 0;
      const cell = document.createElement("a");
      cell.className = `date-cell${dateKey === formatDate(new Date()) ? " today" : ""}`;
      cell.href = `./day.html?date=${dateKey}`;
      cell.innerHTML = `
        <span class="date-number">${day}</span>
        <span class="date-meta">
          ${count ? '<span class="event-dot" aria-hidden="true"></span>' : ""}
          <span>${count ? `${count}项` : " "}</span>
        </span>
      `;
      fragment.appendChild(cell);
    }

    grid.replaceChildren(fragment);
  }

  async function fetchMonthCounts(monthDate) {
    const first = startOfMonth(monthDate);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const { data, error } = await supabaseClient
      .from("schedule_items")
      .select("date")
      .eq("user_id", currentSession.user.id)
      .gte("date", formatDate(first))
      .lte("date", formatDate(last));

    if (error) throw error;

    return (data || []).reduce((map, item) => {
      map.set(item.date, (map.get(item.date) || 0) + 1);
      return map;
    }, new Map());
  }

  async function initDayPage() {
    const date = getDateParam();
    const title = document.querySelector("[data-day-title]");
    const subtitle = document.querySelector("[data-day-subtitle]");
    const newLink = document.querySelector("[data-new-link]");
    const reflectionLink = document.querySelector("[data-reflection-link]");

    if (title) title.textContent = formatChineseDate(date);
    if (subtitle) subtitle.textContent = `${weekdayName(date)}，安排今天的节奏。`;
    if (newLink) newLink.href = `./edit.html?date=${date}`;
    if (reflectionLink) reflectionLink.href = `./reflection.html?date=${date}`;

    const list = document.querySelector("[data-schedule-list]");
    if (list && list.dataset.bound !== "true") {
      list.dataset.bound = "true";
      list.addEventListener("click", handleScheduleListClick);
    }

    await renderDaySchedule(date);
  }

  async function renderDaySchedule(date) {
    const list = document.querySelector("[data-schedule-list]");
    const message = document.querySelector("[data-day-message]");
    const totalSlot = document.querySelector("[data-total-count]");
    const doneSlot = document.querySelector("[data-done-count]");
    if (!list) return;

    if (!canUseCloud()) {
      list.innerHTML = emptyStateHtml("还没有连接云端", "配置 Supabase 并登录后，这里会显示当天日程。");
      setText(totalSlot, "0");
      setText(doneSlot, "0");
      return;
    }

    setMessage(message, "正在读取当天日程...", "");
    const { data, error } = await supabaseClient
      .from("schedule_items")
      .select("*")
      .eq("user_id", currentSession.user.id)
      .eq("date", date)
      .order("start_time", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

    if (error) {
      list.innerHTML = emptyStateHtml("读取失败", "请检查网络或 Supabase 表结构。");
      setMessage(message, error.message, "error");
      return;
    }

    const items = data || [];
    setText(totalSlot, String(items.length));
    setText(doneSlot, String(items.filter((item) => item.status === "done").length));
    setMessage(message, items.length ? "" : "今天还没有日程。", "");

    if (!items.length) {
      list.innerHTML = emptyStateHtml("今天很清爽", "点击新增写下第一项安排。");
      return;
    }

    list.innerHTML = items.map(scheduleCardHtml).join("");
  }

  async function handleScheduleListClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || !canUseCloud()) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    const date = getDateParam();
    const message = document.querySelector("[data-day-message]");

    if (action === "toggle") {
      const nextStatus = button.dataset.nextStatus;
      setMessage(message, "正在更新状态...", "");
      const { error } = await supabaseClient
        .from("schedule_items")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", currentSession.user.id);

      if (error) {
        setMessage(message, error.message, "error");
        return;
      }
      await renderDaySchedule(date);
    }

    if (action === "delete") {
      const confirmed = window.confirm("确定删除这个日程吗？");
      if (!confirmed) return;

      setMessage(message, "正在删除...", "");
      const { error } = await supabaseClient
        .from("schedule_items")
        .delete()
        .eq("id", id)
        .eq("user_id", currentSession.user.id);

      if (error) {
        setMessage(message, error.message, "error");
        return;
      }
      await renderDaySchedule(date);
    }
  }

  async function initEditPage() {
    const date = getDateParam();
    const id = getQuery().get("id");
    const form = document.querySelector("[data-schedule-form]");
    const title = document.querySelector("[data-edit-title]");
    const subtitle = document.querySelector("[data-edit-subtitle]");
    const backLink = document.querySelector("[data-edit-back-link]");
    const cancelLink = document.querySelector("[data-cancel-link]");
    const message = document.querySelector("[data-edit-message]");

    if (!form) return;
    form.elements.date.value = date;
    if (title) title.textContent = id ? "编辑日程" : "新增日程";
    if (subtitle) subtitle.textContent = id ? "调整这项安排的细节。" : "把当天需要完成的事写下来。";
    if (backLink) backLink.href = `./day.html?date=${date}`;
    if (cancelLink) cancelLink.href = `./day.html?date=${date}`;

    const saveButton = form.querySelector("[data-save-schedule]");
    saveButton.disabled = !canUseCloud();

    if (!canUseCloud()) {
      setMessage(message, "预览模式不能保存，请先配置 Supabase 并登录。", "error");
    }

    if (id && canUseCloud() && form.dataset.loadedId !== id) {
      form.dataset.loadedId = id;
      await loadScheduleForEdit(form, id, message);
    }

    if (form.dataset.bound !== "true") {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await saveSchedule(form);
      });
    }
  }

  async function loadScheduleForEdit(form, id, message) {
    setMessage(message, "正在读取日程...", "");
    const { data, error } = await supabaseClient
      .from("schedule_items")
      .select("*")
      .eq("id", id)
      .eq("user_id", currentSession.user.id)
      .single();

    if (error) {
      setMessage(message, error.message, "error");
      return;
    }

    form.elements.title.value = data.title || "";
    form.elements.date.value = data.date || getDateParam();
    form.elements.category.value = data.category || "其他";
    form.elements.start_time.value = data.start_time ? data.start_time.slice(0, 5) : "";
    form.elements.end_time.value = data.end_time ? data.end_time.slice(0, 5) : "";
    form.elements.status.value = data.status || "todo";
    form.elements.notes.value = data.notes || "";
    setMessage(message, "", "");
  }

  async function saveSchedule(form) {
    const message = document.querySelector("[data-edit-message]");
    const id = getQuery().get("id");

    if (!canUseCloud()) {
      setMessage(message, "请先配置 Supabase 并登录。", "error");
      return;
    }

    const title = form.elements.title.value.trim();
    const date = form.elements.date.value;
    const startTime = form.elements.start_time.value || null;
    const endTime = form.elements.end_time.value || null;

    if (!title) {
      setMessage(message, "标题不能为空。", "error");
      return;
    }

    if (startTime && endTime && endTime < startTime) {
      setMessage(message, "结束时间不能早于开始时间。", "error");
      return;
    }

    const payload = {
      user_id: currentSession.user.id,
      date,
      title,
      start_time: startTime,
      end_time: endTime,
      category: form.elements.category.value,
      status: form.elements.status.value,
      notes: form.elements.notes.value.trim() || null,
      updated_at: new Date().toISOString()
    };

    setMessage(message, "正在保存...", "");
    const query = id
      ? supabaseClient.from("schedule_items").update(payload).eq("id", id).eq("user_id", currentSession.user.id)
      : supabaseClient.from("schedule_items").insert(payload);

    const { error } = await query;
    if (error) {
      setMessage(message, error.message, "error");
      return;
    }

    window.location.href = `./day.html?date=${date}`;
  }

  async function initReflectionPage() {
    const date = getDateParam();
    const form = document.querySelector("[data-reflection-form]");
    const title = document.querySelector("[data-reflection-title]");
    const backLink = document.querySelector("[data-reflection-back-link]");
    const cancelLink = document.querySelector("[data-reflection-cancel-link]");
    const message = document.querySelector("[data-reflection-message]");

    if (!form) return;
    if (title) title.textContent = `${formatChineseDate(date)} 感想`;
    if (backLink) backLink.href = `./day.html?date=${date}`;
    if (cancelLink) cancelLink.href = `./day.html?date=${date}`;

    const saveButton = form.querySelector("[data-save-reflection]");
    saveButton.disabled = !canUseCloud();

    if (!canUseCloud()) {
      setMessage(message, "预览模式不能保存，请先配置 Supabase 并登录。", "error");
    } else if (form.dataset.loadedDate !== date) {
      form.dataset.loadedDate = date;
      await loadReflection(form, date, message);
    }

    if (form.dataset.bound !== "true") {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await saveReflection(form);
      });
    }
  }

  async function loadReflection(form, date, message) {
    setMessage(message, "正在读取每日感想...", "");
    const { data, error } = await supabaseClient
      .from("daily_reflections")
      .select("*")
      .eq("user_id", currentSession.user.id)
      .eq("date", date)
      .maybeSingle();

    if (error) {
      setMessage(message, error.message, "error");
      return;
    }

    form.elements.content.value = data?.content || "";
    setMessage(message, data ? "已载入今天的感想。" : "今天还没有写感想。", "");
  }

  async function saveReflection(form) {
    const message = document.querySelector("[data-reflection-message]");
    const date = getDateParam();

    if (!canUseCloud()) {
      setMessage(message, "请先配置 Supabase 并登录。", "error");
      return;
    }

    setMessage(message, "正在保存...", "");
    const { error } = await supabaseClient
      .from("daily_reflections")
      .upsert({
        user_id: currentSession.user.id,
        date,
        content: form.elements.content.value.trim(),
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id,date" });

    if (error) {
      setMessage(message, error.message, "error");
      return;
    }

    setMessage(message, "已保存。", "success");
  }

  function scheduleCardHtml(item) {
    const category = item.category || "其他";
    const status = item.status === "done" ? "done" : "todo";
    const nextStatus = status === "done" ? "todo" : "done";
    const toggleText = status === "done" ? "标为待办" : "标为完成";
    const categoryClass = CATEGORY_CLASSES[category] || CATEGORY_CLASSES["其他"];
    const notes = item.notes ? `<p class="task-notes">${escapeHtml(item.notes)}</p>` : "";

    return `
      <article class="schedule-card ${status === "done" ? "done" : ""}">
        <div>
          <div class="task-time">${escapeHtml(formatTimeRange(item.start_time, item.end_time))}</div>
          <h3>${escapeHtml(item.title)}</h3>
          ${notes}
          <div class="task-meta">
            <span class="pill ${categoryClass}">${escapeHtml(category)}</span>
            <span class="pill status">${STATUS_LABELS[status]}</span>
          </div>
        </div>
        <div class="task-actions">
          <button class="button secondary small" type="button" data-action="toggle" data-id="${item.id}" data-next-status="${nextStatus}">${toggleText}</button>
          <a class="button ghost small" href="./edit.html?date=${item.date}&id=${item.id}">编辑</a>
          <button class="button ghost small" type="button" data-action="delete" data-id="${item.id}">删除</button>
        </div>
      </article>
    `;
  }

  function emptyStateHtml(title, text) {
    return `
      <div class="empty-state">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(text)}</p>
      </div>
    `;
  }

  function canUseCloud() {
    return Boolean(supabaseClient && currentSession?.user?.id);
  }

  function bindOnce(selector, eventName, handler) {
    const el = document.querySelector(selector);
    if (!el || el.dataset.bound === "true") return;
    el.dataset.bound = "true";
    el.addEventListener(eventName, handler);
  }

  function getInitialMonth() {
    const month = getQuery().get("month");
    if (/^\d{4}-\d{2}$/.test(month || "")) {
      const [year, monthNumber] = month.split("-").map(Number);
      return new Date(year, monthNumber - 1, 1);
    }
    return startOfMonth(new Date());
  }

  function updateMonthUrl(monthDate) {
    const url = new URL(window.location.href);
    url.searchParams.set("month", `${monthDate.getFullYear()}-${pad(monthDate.getMonth() + 1)}`);
    window.history.replaceState({}, "", url);
  }

  function getDateParam() {
    const date = getQuery().get("date");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
      return date;
    }
    return formatDate(new Date());
  }

  function getQuery() {
    return new URLSearchParams(window.location.search);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function formatDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatChineseDate(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    return `${year}年${month}月${day}日`;
  }

  function weekdayName(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return `星期${"日一二三四五六"[date.getDay()]}`;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatTimeRange(start, end) {
    const cleanStart = start ? start.slice(0, 5) : "";
    const cleanEnd = end ? end.slice(0, 5) : "";
    if (cleanStart && cleanEnd) return `${cleanStart} - ${cleanEnd}`;
    if (cleanStart) return `${cleanStart} 开始`;
    if (cleanEnd) return `${cleanEnd} 前完成`;
    return "未定时间";
  }

  function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("error", "success");
    if (type) el.classList.add(type);
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
