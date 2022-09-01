<script lang="ts">
  import { onMount } from "svelte";
  import Child from "./Setting.svelte";
  import { setting, confirmPop, processIndicator } from "./setting.js";

  let historyList: any = initHistoryList;
  let processInd = null;

  onMount(() => {
    window.addEventListener("message", (event) => {
      const message = event.data;
      switch (message.type) {
        case "getHistoryOfMonth":
          if (historyList && historyList.hasOwnProperty(message.value.key)) {
            historyList[message.value.key].list = message.value.list;
          }
          break;
        case "removeDateHistoryOfMonth":
          if(typeof processInd === 'object'){
            processInd.remove();
          }
          const dt = new Date(parseInt(message.value.dirname));
          const histKey = `${dt.getFullYear()}${(dt.getMonth() + 1)
            .toString()
            .padStart(2, "0")}`;

          var lst = [];
          historyList[histKey].list.forEach((item, i) => {
            if (item.dirname !== message.value.dirname) {
              lst.push(item);
            }
          });
          historyList[histKey].list = lst;
          break;
        default:
          break;
      }
    });
  });
</script>

<!-- <button
  on:click={() => {
    nadivscode.postMessage({
      type: "onOpenWorkingFilesHistory",
      value: undefined,
    });
  }}>All History By Date</button
> -->

<h4><b>Work History</b></h4>
<div class="sidebar-history-box">
  <ul class="sidebar-history-list">
    {#each Object.entries(historyList) as [key, value]}
      {#if value.text != undefined || !isNaN(value.count)}
        <li
          on:click={() => {
            nadivscode.postMessage({
              type: "getHistoryOfMonth",
              value: key,
            });
          }}
        >
          <div class="title">
            {value.text} <span class="badge">{value.count}</span>
          </div>
          {#if value && value.hasOwnProperty("list")}
            <ul class="sidebar-history-item-list">
              {#each value.list as item}
                <li>
                  <div>
                    <div
                      on:click={(e) => {
                        e.preventDefault();
                        nadivscode.postMessage({
                          type: "onOpenWorkingFilesHistory",
                          value: item.dirname,
                        });
                      }}
                    >
                      {item.text}
                      {#if parseInt(item.count) > 0}
                        <span class="badge">{item.count}</span>
                      {:else}
                        <small class="italic gray">No files changed</small>
                      {/if}
                    </div>

                    <span class="tools">
                      <span
                        class="button del"
                        on:click={() => {
                          confirmPop(
                            `Delete all history of ${item.text}?`,
                            () => {
                              processInd = processIndicator();
                              nadivscode.postMessage({
                                type: "delHistoryFolder",
                                value: item,
                              });
                            }
                          );
                        }}
                      >
                        <i class="icon-trash" />
                      </span>
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/if}
    {/each}
  </ul>
</div>
<Child bind:value={$setting} />
