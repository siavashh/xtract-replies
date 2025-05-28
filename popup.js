let allReplies = [];

// Function to convert timestamp to human-readable format
function convertDate(timestamp) {
  // Generate filename based on current date and time
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-based, so +1
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const fileName = `Xtract-replies-${year}-${month}-${day}-${hours}-${minutes}`;

  // Handle the timestamp conversion for display
  if (!timestamp || timestamp === "N/A")
    return { short: "N/A", full: "N/A", fileName };
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return { short: "N/A", full: "N/A", fileName };

    // Full version for the title (includes AM/PM)
    const full = date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });

    // Short version for display (excludes AM/PM)
    const short = date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: false, // 24-hour format, effectively removes AM/PM
    });

    return { short, full, fileName };
  } catch (error) {
    return { short: "N/A", full: "N/A", fileName };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendReplies") {
    const statusDiv = document.getElementById("status");
    const repliesDiv = document.getElementById("replies");
    const downloadCsvBtn = document.getElementById("downloadCsvBtn");
    const downloadHtmlBtn = document.getElementById("downloadHtmlBtn");
    const stopBtn = document.getElementById("stopGrabbingData");

    if (request.status === "loading") {
      statusDiv.textContent = "Loading replies...";
      downloadCsvBtn.disabled = true;
      downloadHtmlBtn.disabled = true;
      stopBtn.disabled = false;
    } else if (request.status === "complete" || request.status === "stopped") {
      statusDiv.textContent =
        request.status === "complete"
          ? `Found ${request.replies.length} replies`
          : `Stopped. Found ${request.replies.length} replies`;
      downloadCsvBtn.disabled = false;
      downloadHtmlBtn.disabled = false;
      stopBtn.disabled = true; // Disable Stop button when done or stopped
    } else if (request.status === "error") {
      statusDiv.textContent = "Error loading replies.";
      downloadCsvBtn.disabled = true;
      downloadHtmlBtn.disabled = true;
      stopBtn.disabled = true;
    }

    allReplies = request.replies;
    mainTweet = request.mainTweet || {};
    repliesDiv.innerHTML = allReplies
      .map(
        (reply, index) =>
          `<div class="reply">
            <p><strong>Reply ${index + 1}</strong></p>
            <p><strong>User:</strong> ${
              reply.username || "N/A"
            } <span style="color: var(--muted-text);">@${
            reply.handle || "N/A"
          }</span></p>
            <p><strong>Timestamp:</strong> ${
              convertDate(reply.timestamp).full
            }</p>
            <p><strong>Tweet URL:</strong> <a href="${
              reply.tweetUrl || "#"
            }" target="_blank">${reply.tweetUrl || "N/A"}</a></p>
            <p><strong>Text:</strong> ${reply.text || "N/A"}</p>
            <p><strong>Likes:</strong> ${reply.likes || 0}</p>
            <p><strong>Replies:</strong> ${reply.replies || 0}</p>
            <p><strong>Views:</strong> ${reply.views || 0}</p>
          </div>`
      )
      .join("");
  }
});

// Click handler for the stopGrabbingData button
document.getElementById("stopGrabbingData").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "stopLoading" }, (response) => {
    if (response && response.status === "stopped") {
      document.getElementById("stopGrabbingData").disabled = true;
      document.getElementById(
        "status"
      ).textContent = `Stopped. Found ${allReplies.length} replies`;
      document.getElementById("downloadCsvBtn").disabled = false;
      document.getElementById("downloadHtmlBtn").disabled = false;
    } else {
      document.getElementById("stopGrabbingData").disabled = true;
      document.getElementById("status").textContent =
        allReplies.length > 0
          ? `Error stopping. Found ${allReplies.length} replies`
          : "Error stopping. No replies found.";
      document.getElementById("downloadCsvBtn").disabled =
        allReplies.length === 0;
      document.getElementById("downloadHtmlBtn").disabled =
        allReplies.length === 0;
    }
  });
});

const currentYear = new Date().getFullYear();
const copyrightText = `© ${currentYear} Siavashh 🪄✨ | Built with 💙 for X lovers | Say hi or endorse me on <a href="https://x.com/siavashh" target="_blank">@siavashh</a>!`;
// Download CSV
document.getElementById("downloadCsvBtn").addEventListener("click", () => {
  const footer =
    "Siavashh Keshmiri,Siavashh,,https://x.com/siavashh,Built with 💙 for X lovers | Say hi or endorse me on @siavashh";
  const csvContent = [
    "username,handle,timestamp,tweetUrl,text,likes,replies,views",
    ...allReplies.map((reply) => {
      const row = [
        reply.username || "N/A",
        reply.handle || "N/A",
        convertDate(reply.timestamp).full,
        reply.tweetUrl || "N/A",
        reply.text || "N/A",
        reply.likes || 0,
        reply.replies || 0,
        reply.views || 0,
      ];
      return row
        .map((value) =>
          typeof value === "string" ? `"${value.replace(/"/g, '""')}"` : value
        )
        .join(",");
    }),
    "", // Blank row for separation
    `${footer}`, // Footer row (wrapped in quotes since it contains commas)
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const { fileName } = convertDate();
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

// Download HTML
document.getElementById("downloadHtmlBtn").addEventListener("click", () => {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Xtract Replies</title>
      <style>
        :root {
            --primary: #2a9d8f;
            --link-hover: #4fdbca;
            --secondary: #e9c369;
            --muted: #afd3ce;
            --muted-text: #6b8783;
            --background: #f8f8f8;
            --table-light: #f0f0ee;
            --table-dark: #d1d3cb;
            --table-spam: #f2e7ce;
            --text-color: #1b263b;
            --danger: #e63946;
        }
        body {
          font-family: "Vazirmatn", 'Helvetica Neue', Arial, sans-serif;
          font-optical-sizing: auto;
          font-weight: 400;
          font-style: normal;
          margin: 20px;
          background: var(--background);
          color: var(--text-color);
        }
        h1 {
          text-align: center;
          color: var(--primary);
        }
        .main-tweet {
          max-width: 700px;
          margin: 20px auto;
          padding: 15px;
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          transition:all ease 0.5s;
          cursor:pointer;
        }
        .main-tweet:hover {
          transform:scale(1.03);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        } 
        .main-tweet .user {
          font-weight: 600;
          margin-bottom: 5px;
        }
        .main-tweet .user .handle {
          color: var(--muted);
        }
        .main-tweet .text {
          margin: 10px 0;
          word-break: break-word;
          width: 100%;
          box-sizing: border-box;
          max-width:none;
        }
        .main-tweet .text-rtl {
          direction: rtl;
          text-align: right;
        }
        .main-tweet .text-ltr {
          direction: ltr;
          text-align: left;
        }
        .main-tweet .stats {
          display: flex;
          gap: 20px;
          color: var(--muted);
        }
        .main-tweet .stats span {
          display: flex;
          align-items: center; /* Center the icon and text vertically */
          gap: 5px; /* Space between icon and text */
        }
        .main-tweet .stats svg {
          width: 20px; /* Match the size used in the table */
          height: 20px;
        }
        table {
          width: 100%;
          max-width: 1200px;
          margin: 20px auto;
          border-collapse: collapse;
          background-color: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        th, td {
          padding: 8px; /* Reduced padding for more compact rows */
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: var(--primary);
          color: white;
          font-weight: 600;
        }
        tr:nth-child(even) {
          background-color: var(--table-light);
        }
        tr:hover {
          background-color: var(--table-dark);
        }
        tr.spam{
          background-color:var(--table-spam);
        }
        td {
          word-break: break-word;
          vertical-align: middle; /* Center content vertically */
        }
        .postType {
          width: 40px; /* Reduced width since we're using icons */
          text-align: center;
        }
        .user {
          width: 130px;
        }
        td.user{
          font-size: 0.8em;
        }
        .user .handle {
          color: var(--muted-text);
        }
        .timestamp {
          width: 130px; /* Reduced width for compact layout */
        }
        td.timestamp {
          font-size: 0.7em;
        }
        .tweetUrl {
          width: 50px; /* Small width for button */
          text-align: center;
        }
        .tweetUrl button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
        }
        .tweetUrl button:hover{
          color:var(--link-hover)
        }
        .tweetUrl svg {
          width: 16px;
          height: 16px;
        }
        .text {
          max-width: 300px; /* Reduced max-width for compact layout */
        }
        .text-rtl {
          direction: rtl;
          text-align: right;
        }
        .text-ltr {
          direction: ltr;
          text-align: left;
        }
        .likes, .replies, .views {
          text-align: center;
          min-width: 20px;
        }
        .likes svg, .replies svg, .views svg {
          width:20px;
        }
        a {
          color: var(--primary);
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
          color:var(--link-hover)
        }
        .reply-icon {
          width: 16px;
          height: 16px;
        }
        .summary {
          text-align: center;
          margin: 20px 0;
          color: var(--text-color);
          font-size: 14px;
        }
        .summary a {
          color: var(--primary);
          text-decoration: underline;
        }
        .copyright-footer {
          max-width: 1200px;
          margin: 20px auto;
          text-align: center;
          color: var(--muted);
          font-size: 14px;
        }
        .copyright-footer p {
          margin: 0;
        }
        .copyright-footer a {
          color: var(--primary);
          text-decoration: none;
        }
        .copyright-footer a:hover {
          text-decoration: underline;
          color: var(--link-hover);
        }
      </style>
    </head>
    <body>
      <h1>
      <svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 304.88 323.42" width="25">
          <defs>
              <style>
                  .cls-1 {
                      fill: #2a9d8f;
                  }

                  .cls-2 {
                      fill: #afd3ce;
                  }
              </style>
          </defs>
          <g>
              <polygon class="cls-2"
                  points="188.22 136.95 185.28 140.33 173.64 153.87 173.58 153.79 173.57 153.79 173.64 153.9 278.13 303.35 235.25 303.35 149.98 181.4 149.98 181.39 149.93 181.34 149.97 181.39 135.82 197.83 135.82 197.83 135.83 197.85 222.11 323.42 295.46 323.42 304.88 306.72 188.22 136.95" />
              <polygon class="cls-2" points="299.65 7.42 295.46 0 278.12 0 175.82 118.91 188.22 136.94 299.65 7.42" />
          </g>
          <polygon class="cls-1" points="188.22 136.95 94.17 .07 0 .07 123.55 179.88 .14 323.32 27.89 323.32 188.22 136.95" />
      </svg>tract Replies</h1>
      ${
        mainTweet.username
          ? `
        <div class="main-tweet" onclick="window.open('${
          mainTweet.tweetUrl
        }', '_blank')" style="cursor: pointer;">
        <div class="user">
          ${mainTweet.username || "N/A"} <span class="handle">${
              mainTweet.handle && mainTweet.handle !== "N/A"
                ? `<a href="https://x.com/${mainTweet.handle}" onclick="event.stopPropagation();">@${mainTweet.handle}</a>`
                : `@${mainTweet.handle || "N/A"}`
            }</span>
        </div>
        <div class="text ${mainTweet.isRTL ? "text-rtl" : "text-ltr"}">${
              mainTweet.text || "N/A"
            }</div>
        <div class="stats">
          <span>
            <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <g>
                <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
              </g>
            </svg>
            ${mainTweet.likes || 0}
          </span>
          <span>
            <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <g>
                <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path>
              </g>
            </svg>
            ${mainTweet.replies || 0}
          </span>
          <span>
            <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <g>
                <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"></path>
              </g>
            </svg>
            ${mainTweet.views || 0}
          </span>
        </div>
      </div>
      `
          : ""
      }
      <div class="summary">
        This tweet by ${mainTweet.username || "N/A"} (<a href="${
    mainTweet.tweetUrl || "#"
  }" target="_blank">@${mainTweet.handle || "N/A"}</a>)
        has a total of ${mainTweet.replies || 0} replies. ${
    allReplies.length
  } replies were extracted here. It has received ${
    mainTweet.likes || 0
  } likes and ${mainTweet.views || 0} views.
      </div>
      <table>
        <thead>
          <tr>
            <!-- <th class="postType"></th> -->
            <th class="user">User</th>
            <th class="timestamp">Time</th>
            <th class="text"></th>
            <th class="likes"><svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><g><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></g></svg></th>
            <th class="replies"><svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><g><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path></g></svg></th>
            <th class="views"><svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><g><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"></path></g></svg></th>
            <th class="tweetUrl"></th> 
          </tr>
        </thead>
        <tbody>
          ${allReplies
            .map(
              (reply) => `
                <tr class="${
                  !reply.timestamp || reply.timestamp === "N/A" ? "spam" : ""
                }">
                  <td class="user">
                    ${reply.username || "N/A"} <span class="handle">${
                reply.handle && reply.handle !== "N/A"
                  ? `<a href="https://x.com/${reply.handle}">@${reply.handle}</a>`
                  : `@${reply.handle || "N/A"}`
              }</span>
                  </td>
                  <td class="timestamp" title="${
                    reply.timestamp && reply.timestamp !== "N/A"
                      ? convertDate(reply.timestamp).full
                      : "N/A"
                  }">${
                reply.timestamp && reply.timestamp !== "N/A"
                  ? convertDate(reply.timestamp).short
                  : "N/A"
              }</td>
                  
                  <td class="text ${reply.isRTL ? "text-rtl" : "text-ltr"}">${
                reply.text || "N/A"
              }</td>
                  <td class="likes">${reply.likes || 0}</td>
                  <td class="replies">${reply.replies || 0}</td>
                  <td class="views">${reply.views || 0}</td>
                  <td class="tweetUrl">
                    ${
                      reply.tweetUrl && reply.tweetUrl !== "N/A"
                        ? `<button onclick="window.open('${reply.tweetUrl}', '_blank')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h3a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5v0a5 5 0 0 1 5-5h3m0 5h6" /></svg>
                          </button>`
                        : `<span title="AD"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11V12C21 17.4903 16.761 20.1547 14.1014 21.286C13.38 21.5929 13.0193 21.7464 12 21.7464C10.9807 21.7464 10.62 21.5929 9.89856 21.286C7.23896 20.1547 3 17.4903 3 12V6.71888C3 4.52896 3 3.434 3.70725 2.83487C4.4145 2.23574 5.49553 2.41591 7.6576 2.77626L8.71202 2.95199C10.3523 3.22537 11.1724 3.36205 12 3.36205C12.8276 3.36205 13.6477 3.22537 15.288 2.95199L16.3424 2.77626C18.5045 2.41591 19.5855 2.23574 20.2927 2.83487C21 3.434 21 4.52896 21 6.71888V7" stroke="#e63946" stroke-width="1.5" stroke-linecap="round"/><path d="M6.5 9C6.79112 8.4174 7.57665 8 8.5 8C9.42335 8 10.2089 8.4174 10.5 9" stroke="#e63946" stroke-width="1.5" stroke-linecap="round"/><path d="M13.5 9C13.7911 8.4174 14.5766 8 15.5 8C16.4234 8 17.2089 8.4174 17.5 9" stroke="#e63946" stroke-width="1.5" stroke-linecap="round"/><path d="M8.5 15C8.5 15 9.55 14 12 14C14.45 14 15.5 15 15.5 15" stroke="#e63946" stroke-width="1.5" stroke-linecap="round"/></svg></span>`
                    }
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
      
      <footer class="copyright-footer">
        <p>
          ${copyrightText}
        </p>
      </footer>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
  const link = document.createElement("a");
  const { fileName } = convertDate();
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
});
