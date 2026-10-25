import { parseRange, readInterval } from './time-data.js?v=timetable-1';
export function makeSlots(
  startDate,
  endDate
) {

  const startParts =
    startDate
      .split("-")
      .map(Number);

  const endParts =
    endDate
      .split("-")
      .map(Number);

  const current =
    new Date(
      Date.UTC(
        startParts[0],
        startParts[1] - 1,
        startParts[2]
      )
    );

  const end =
    new Date(
      Date.UTC(
        endParts[0],
        endParts[1] - 1,
        endParts[2]
      )
    );

  const slots = [];

  while (
    current <= end
  ) {

    const year =
      current.getUTCFullYear();

    const month =
      String(
        current.getUTCMonth() + 1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        current.getUTCDate()
      ).padStart(
        2,
        "0"
      );

    const dateKey =
      `${year}-${month}-${day}`;

    for (
      let hour = 9;
      hour < 22;
      hour++
    ) {

      const startHour =
        String(hour)
          .padStart(
            2,
            "0"
          );

      const endHour =
        String(hour + 1)
          .padStart(
            2,
            "0"
          );

      slots.push(
        `${dateKey} ` +
        `${startHour}:00〜${endHour}:00`
      );

    }

    current.setUTCDate(
      current.getUTCDate() + 1
    );

  }

  return slots;
}

// ===============================
// 集計
// ===============================

export function calculateRanking(
  responses,
  group,
  slots
) {

  const ranking =
    slots.map(
      slot => {

        let yes = 0;
        let no = 0;
        let maybe = 0;

        responses.forEach(
          response => {

            const groupData =
              response.answers?.[group] ||
              response[group] ||
              {};

            const range = parseRange(slot);
            const answer = (range ? readInterval(groupData, range.date, range.start, range.end) : undefined) || "maybe";

            if (
              answer === "yes"
            ) {

              yes++;

            }

            else if (
              answer === "no"
            ) {

              no++;

            }

            else {

              maybe++;

            }

          }
        );

        // 元アプリと同じ評価方式
        const score =
          yes * 3
          +
          maybe * 0.5
          -
          no * 4;

        return {
          slot,
          yes,
          no,
          maybe,
          score
        };

      }
    );

  ranking.sort(
    (a, b) => {

      if (
        b.score !==
        a.score
      ) {

        return (
          b.score -
          a.score
        );

      }

      if (
        b.yes !==
        a.yes
      ) {

        return (
          b.yes -
          a.yes
        );

      }

      if (
        a.no !==
        b.no
      ) {

        return (
          a.no -
          b.no
        );

      }

      return (
        a.slot.localeCompare(
          b.slot
        )
      );

    }
  );

  return ranking;
}

// ===============================
// 表示
// ===============================

export function renderRanking(
  rankingArea,
  title,
  ranking,
  total
) {

  const section =
    document.createElement(
      "section"
    );

  const heading =
    document.createElement(
      "h2"
    );

  heading.textContent =
    title;

  section.appendChild(
    heading
  );

  const table =
    document.createElement(
      "table"
    );

  table.innerHTML = `
    <thead>

      <tr>

        <th>順位</th>

        <th>日時</th>

        <th>○</th>

        <th>×</th>

        <th>？</th>

        <th>スコア</th>

        <th>評価</th>

      </tr>

    </thead>

    <tbody></tbody>
  `;

  const tbody =
    table.querySelector(
      "tbody"
    );

  ranking
    .slice(
      0,
      10
    )
    .forEach(
      (item, index) => {

        const row =
          document.createElement(
            "tr"
          );

        if (
          index < 3
        ) {

          row.classList.add(
            "top"
          );

        }

        if (
          item.no === 0 &&
          item.yes === total &&
          total > 0
        ) {

          row.classList.add(
            "good"
          );

        }

        let comment = "";

        if (
          total === 0
        ) {

          comment =
            "回答なし";

        }

        else if (
          item.no === 0 &&
          item.yes === total
        ) {

          comment =
            "全員○！";

        }

        else if (
          item.no === 0 &&
          item.yes >=
            total * 0.7
        ) {

          comment =
            "×なし・有力";

        }

        else if (
          item.no === 0
        ) {

          comment =
            "×なし";

        }

        else if (
          item.no === 1
        ) {

          comment =
            "×1人";

        }

        else {

          comment =
            `×${item.no}人`;

        }

        row.innerHTML = `
          <td>
            ${index + 1}
          </td>

          <td>
            ${escapeHtml(item.slot)}
          </td>

          <td>
            ${item.yes}
          </td>

          <td>
            ${item.no}
          </td>

          <td>
            ${item.maybe}
          </td>

          <td>
            ${item.score}
          </td>

          <td>
            ${comment}
          </td>
        `;

        tbody.appendChild(
          row
        );

      }
    );

  section.appendChild(
    table
  );

  rankingArea.appendChild(
    section
  );

}

// ===============================
// HTML安全化
// ===============================

function escapeHtml(
  text
) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent =
    text;

  return div.innerHTML;
}
