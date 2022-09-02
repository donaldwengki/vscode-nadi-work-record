<script lang="ts">
  export let data = {
    title: "No Title",
  };

  export let onSearchCallback: any; 
  export let buttons: Array<{title: string, callback: any}>;
</script>

<div class="panel">
  <h3 class="wf-title">
    {data.title}
  </h3>
  <div class="search-box">
    <span class="icon">
      <i class="icon-search" />
    </span>
    <input
      type="text"
      on:keyup={(e) => {
        if (onSearchCallback) onSearchCallback(e.target);
      }}
    />
    {#each buttons as btn}
        <button on:click={(e) => {
            if(btn.callback) btn.callback(e);
        }}>{btn.title}</button>
    {/each}
  </div>
</div>
