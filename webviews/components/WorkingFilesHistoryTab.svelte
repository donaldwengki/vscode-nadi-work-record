<script lang="ts">
import { rejects } from "assert";

  import { onMount } from "svelte";
  import { confirmPop, processIndicator } from "./setting.js";
  import WfhTool from "./WFHTool.svelte";

  let projectFileHistory: any = workFilesHistory;
  let historyCollections: any = {};
  let list = [];

  if (targetFolderData && targetFolderData.hasOwnProperty("key")) {
    list = projectFileHistory[targetFolderData.key];
  }

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

  const onSearch = (e) => {
    const fltr = projectFileHistory[targetFolderData.key].filter((item) =>
      item.rpath.includes(e.value)
    );
    list = fltr;
  };

  let selectionItem: boolean = false;
  let checkedAll: boolean = false;

  const buttons = [
    {
      title: "Show Selection",
      callback: (e) => {
        selectionItem = !selectionItem ? true : false;
        if (selectionItem) {
          toolButtons.push({
            title: "Select All",
            callback: (ei) => {
              checkedAll = !checkedAll ? true : false;
              if (checkedAll) {
                ei.target.innerText = "Unselect All";
                document
                  .querySelectorAll(".item-checkbox")
                  .forEach((checkBox: any) => {
                    checkBox.checked = true;
                  });
              } else {
                document
                  .querySelectorAll(".item-checkbox")
                  .forEach((checkBox: any) => {
                    checkBox.checked = false;
                  });
                ei.target.innerText = "Select All";
              }
            },
          });
          toolButtons.push({
            title: "Delete",
            callback: (eii) => {
              const bulkDel = [];
              document
                .querySelectorAll(".item-checkbox")
                .forEach((checkBox) => {
                  if ((checkBox as any).checked) {
                    bulkDel.push(JSON.parse((checkBox as any).value));
                  }
                });
              
              if (bulkDel.length > 0) {
                confirmPop(
                  `Delete ${bulkDel.length > 1 ? bulkDel.length + ' items' : bulkDel.length + ' item'} from "${targetFolderData.date}" history data?`,
                  () => {
                    processIndicator();
                    nadivscode.postMessage({
                      type: "deleteBulkHistoryFile",
                      value: {
                        list: bulkDel,
                        dirname: targetFolderData.key,
                      },
                    });
                  }
                );
              } else {
                confirmPop('No data selected!');
              }
            },
          });
          toolButtons = buttons;
          e.target.innerText = "Hide Selection";
        } else {
          toolButtons = [buttons[0]];
          e.target.innerText = "Show Selection";
        }
      },
    },
  ];

  let toolButtons: any = buttons;

  nadivscode.postMessage({
    type: "sidebarStopProcessIndicator",
    value: null,
  });
</script>

<h2>Working File History</h2>
<!-- svelte-ignore missing-declaration -->
{#if targetFolderData && targetFolderData.hasOwnProperty("date")}
  <WfhTool
    data={{ title: targetFolderData.date }}
    onSearchCallback={onSearch}
    buttons={toolButtons}
  />
{/if}
<div class="container">
  <!-- svelte-ignore missing-declaration -->
  {#if targetFolderData && targetFolderData.hasOwnProperty("date") && targetFolderData.hasOwnProperty("key")}
    <ul class="history-list-collection">
      {#each list as item}
        <li>
          {#if selectionItem}
            <input
              type="checkbox"
              class="item-checkbox"
              name="item[]"
              value={JSON.stringify(item)}
            />
          {/if}
          <div class="list-item">
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
                <!-- svelte-ignore missing-declaration -->
                <span
                  class="button del"
                  on:click={() => {
                    confirmPop(
                      `Delete "${item.rpath}" from working history?`,
                      () => {
                        processIndicator();
                        nadivscode.postMessage({
                          type: "deleteHistoryFile",
                          value: Object.assign(item, {
                            dirname: targetFolderData.key,
                          }),
                        });
                      }
                    );
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
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
