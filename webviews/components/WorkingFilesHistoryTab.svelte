<script lang="ts">
  import { rejects } from "assert";

  import { resolve } from "path";

  import { onMount } from "svelte";

  let projectFileHistory: any = workFilesHistory;
  let historyCollections: any = {};

  let getDateHour = (time: number) => {
    var month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const dirnameToDate = new Date(time);
    var dd = String(dirnameToDate.getDate()).padStart(2, "0");
    var mmm = month[dirnameToDate.getMonth()];
    var yyyy = dirnameToDate.getFullYear();

    return `${mmm} ${dd}, ${yyyy} ${String(dirnameToDate.getHours()).padStart(
      2,
      "0"
    )}:${String(dirnameToDate.getMinutes()).padStart(2, "0")}`;
  };

  onMount(() => {
    window.addEventListener("message", (event) => {
      switch (event.data.type) {
        case "receiveHistoryCollections":
          historyCollections = Object.assign(
            historyCollections,
            event.data.value
          );
          break;
        default:
          break;
      }
    });
  });

  const confirmPop = (text, callback) => {
    const modal = document.createElement("div");
    modal.setAttribute("id", "modalBox");
    modal.addEventListener("click", () => {
      modal.remove();
    })

    const bx = document.createElement("div");
    bx.setAttribute("id", "box");
    bx.innerHTML = text;

    const toolBox = document.createElement("div");
    toolBox.setAttribute("id", "box-tools");

    const buttonOK = document.createElement("button");
    buttonOK.className = "ok";
    buttonOK.innerHTML = "OK";
    buttonOK.setAttribute('type', 'button');
    buttonOK.addEventListener('click', () => {
      modal.remove();
      callback();
    });
    const buttonCancel = document.createElement("button");
    buttonCancel.className = "cancel";
    buttonCancel.innerHTML = "Cancel";
    buttonCancel.setAttribute('type', 'button');
    buttonCancel.addEventListener('click',() => {
      modal.remove();
    })

    toolBox.appendChild(buttonOK);
    toolBox.appendChild(buttonCancel);
    bx.appendChild(toolBox);

    modal.appendChild(bx);
    document.body.appendChild(modal);
  };
</script>

<h2>Working File History</h2>
{#if targetFolderData && targetFolderData.hasOwnProperty("date")}
  <h3>{targetFolderData.date}</h3>
{/if}
{#if targetFolderData && targetFolderData.hasOwnProperty("date") && targetFolderData.hasOwnProperty("key")}
  <ul class="history-list-collection">
    {#each projectFileHistory[targetFolderData.key] as item}
      <li>
        <div class="list-item-text">
          <span
            class="info-path"
            on:click={() => {
              nadivscode.postMessage({
                type: "seeHistoryFileDiff",
                value: Object.assign(item, {
                  dirname: targetFolderData.key,
                }),
              });
            }}>{item.rpath}</span
          >
          <!-- ( {item.index} ) -->
          <span class="tools">
            <span
              class="button open"
              on:click={() => {
                nadivscode.postMessage({
                  type: "seeHistoryFileDiff",
                  value: Object.assign(item, {
                    dirname: targetFolderData.key,
                  }),
                });
              }}
            >
              <i class="icon-external-link-sign" />
            </span>
            <span
              class="button del"
              on:click={() => {
                confirmPop(`Delete "${item.rpath}" from working history?`, () => {
                  nadivscode.postMessage({
                    type: "deleteHistoryFile",
                    value: Object.assign(item, {
                      dirname: targetFolderData.key,
                    }),
                  });
                });
              }}
            >
              <i class="icon-trash" />
            </span>
          </span>
        </div>
        <div>
          <small>
            {#if item && item.hasOwnProperty("rename")}
              <span class="info-rename">
                {getDateHour(item.rename)} -> new/rename
              </span>
            {/if}
            {#if item && item.hasOwnProperty("change")}
              <span class="info-change"
                >{getDateHour(item.change)} -> last change</span
              >
            {/if}
          </small>
        </div>
      </li>
    {/each}
  </ul>
{:else}
  <ul class="history-list">
    {#each projectFileHistory as historyDate}
      <li>
        <span
          on:click={() => {
            nadivscode.postMessage({
              type: "getHistoryCollections",
              value: historyDate.path,
            });
          }}>{historyDate.text}</span
        >
        <!-- {historyDate.dirname} -->
        {#if historyCollections && historyCollections.hasOwnProperty(historyDate.dirname)}
          {#if historyCollections[historyDate.dirname].length > 0}
            <ul class="history-list-collection">
              {#each historyCollections[historyDate.dirname] as item}
                <li>
                  <div class="list-item-text">
                    <span
                      class="info-path"
                      on:click={() => {
                        nadivscode.postMessage({
                          type: "seeHistoryFileDiff",
                          value: Object.assign(item, {
                            dirname: historyDate.dirname,
                          }),
                        });
                      }}>{item.rpath}</span
                    >
                    <!-- ( {item.index} ) -->
                    <span class="tools">
                      <span
                        class="button open"
                        on:click={() => {
                          nadivscode.postMessage({
                            type: "seeHistoryFileDiff",
                            value: Object.assign(item, {
                              dirname: historyDate.dirname,
                            }),
                          });
                        }}
                      >
                        <i class="icon-external-link-sign" />
                      </span>
                      <span
                        class="button del"
                        on:click={() => {
                          nadivscode.postMessage({
                            type: "deleteHistoryFile",
                            value: Object.assign(item, {
                              dirname: historyDate.dirname,
                            }),
                          });
                        }}
                      >
                        <i class="icon-trash" />
                      </span>
                    </span>
                  </div>
                  <div>
                    <small>
                      {#if item && item.hasOwnProperty("rename")}
                        <span class="info-rename">
                          {getDateHour(item.rename)} -> new/rename
                        </span>
                      {/if}
                      {#if item && item.hasOwnProperty("change")}
                        <span class="info-change"
                          >{getDateHour(item.change)} -> last change</span
                        >
                      {/if}
                    </small>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <div>There is no history of changes to the project.</div>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>
{/if}
