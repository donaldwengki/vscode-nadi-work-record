import { writable } from 'svelte/store'

export const setting = writable('Initial')
export const confirmPop = (text, callback) => {
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
    if (callback !== undefined)
      callback();
  });
  toolBox.appendChild(buttonOK);

  if (callback !== undefined) {
    const buttonCancel = document.createElement("button");
    buttonCancel.className = "cancel";
    buttonCancel.innerHTML = "Cancel";
    buttonCancel.setAttribute('type', 'button');
    buttonCancel.addEventListener('click', () => {
      modal.remove();
    })
    toolBox.appendChild(buttonCancel);
  }

  bx.appendChild(toolBox);
  modal.appendChild(bx);
  document.body.appendChild(modal);
};
export const processIndicator = (callback) => {
  const modal = document.createElement("div");
  modal.setAttribute("id", "modalBox");

  const bx = document.createElement("div");
  bx.setAttribute("id", "box");
  bx.innerHTML = `Processing... please wait.`;

  const toolBox = document.createElement("div");
  toolBox.setAttribute("id", "box-tools");

  bx.appendChild(toolBox);

  modal.appendChild(bx);
  document.body.appendChild(modal);
  return modal;
}