var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* webviews/components/Setting.svelte generated by Svelte v3.49.0 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	return child_ctx;
    }

    // (23:4) {#each historyIgnoreList as item}
    function create_each_block$1(ctx) {
    	let li;
    	let div0;
    	let t0_value = /*item*/ ctx[7] + "";
    	let t0;
    	let t1;
    	let div1;
    	let label;
    	let input;
    	let input_checked_value;
    	let t2;
    	let span;
    	let t3;
    	let mounted;
    	let dispose;

    	function change_handler() {
    		return /*change_handler*/ ctx[3](/*item*/ ctx[7]);
    	}

    	return {
    		c() {
    			li = element("li");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");
    			label = element("label");
    			input = element("input");
    			t2 = space();
    			span = element("span");
    			t3 = space();
    			attr(div0, "class", "title");
    			attr(div0, "title", /*item*/ ctx[7]);
    			attr(input, "type", "checkbox");

    			input.checked = input_checked_value = /*cancelRemoveHistoryIgnoreItem*/ ctx[1] != /*item*/ ctx[7]
    			? true
    			: false;

    			attr(span, "class", "slider round");
    			attr(label, "class", "switch");
    			attr(div1, "class", "del-slide");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, div0);
    			append(div0, t0);
    			append(li, t1);
    			append(li, div1);
    			append(div1, label);
    			append(label, input);
    			append(label, t2);
    			append(label, span);
    			append(li, t3);

    			if (!mounted) {
    				dispose = listen(input, "change", change_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*cancelRemoveHistoryIgnoreItem*/ 2 && input_checked_value !== (input_checked_value = /*cancelRemoveHistoryIgnoreItem*/ ctx[1] != /*item*/ ctx[7]
    			? true
    			: false)) {
    				input.checked = input_checked_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (50:4) {#if settings.devTool}
    function create_if_block$1(ctx) {
    	let span;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Dev Tool";
    			attr(span, "class", "clickable");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (!mounted) {
    				dispose = listen(span, "click", /*click_handler*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(span);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div0;
    	let ul;
    	let div0_class_value;
    	let t0;
    	let div3;
    	let div1;
    	let t1;
    	let span0;
    	let t3;
    	let div2;
    	let span1;
    	let mounted;
    	let dispose;
    	let each_value = /*historyIgnoreList*/ ctx[2];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	let if_block = settings.devTool && create_if_block$1(ctx);

    	return {
    		c() {
    			div0 = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			div3 = element("div");
    			div1 = element("div");
    			if (if_block) if_block.c();
    			t1 = space();
    			span0 = element("span");
    			span0.textContent = "Reload";
    			t3 = space();
    			div2 = element("div");
    			span1 = element("span");
    			span1.textContent = "History Ignore";
    			attr(div0, "class", div0_class_value = "pop-box bottom right historyIgnoreList " + (/*historyIgnorePopOpen*/ ctx[0] ? 'show' : 'hide'));
    			attr(span0, "class", "clickable");
    			attr(div1, "class", "left");
    			attr(span1, "class", "clickable");
    			attr(div2, "class", "right");
    			attr(div3, "class", "sidebar-panel-bottom");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			append(div0, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			insert(target, t0, anchor);
    			insert(target, div3, anchor);
    			append(div3, div1);
    			if (if_block) if_block.m(div1, null);
    			append(div1, t1);
    			append(div1, span0);
    			append(div3, t3);
    			append(div3, div2);
    			append(div2, span1);

    			if (!mounted) {
    				dispose = [
    					listen(span0, "click", /*click_handler_1*/ ctx[5]),
    					listen(span1, "click", /*click_handler_2*/ ctx[6])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*cancelRemoveHistoryIgnoreItem, historyIgnoreList, nadivscode*/ 6) {
    				each_value = /*historyIgnoreList*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*historyIgnorePopOpen*/ 1 && div0_class_value !== (div0_class_value = "pop-box bottom right historyIgnoreList " + (/*historyIgnorePopOpen*/ ctx[0] ? 'show' : 'hide'))) {
    				attr(div0, "class", div0_class_value);
    			}

    			if (settings.devTool) if_block.p(ctx, dirty);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(div3);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let historyIgnoreList = settings.historyIgnore;
    	let historyIgnorePopOpen = false;
    	let cancelRemoveHistoryIgnoreItem = '';

    	onMount(() => {
    		window.addEventListener("message", event => {
    			switch (event.data.type) {
    				case 'settingHistoryIgnoreCANCELRemoveItem':
    					{
    						$$invalidate(1, cancelRemoveHistoryIgnoreItem = '');
    						break;
    					}
    			}
    		});
    	});

    	const change_handler = item => {
    		$$invalidate(1, cancelRemoveHistoryIgnoreItem = item);

    		nadivscode.postMessage({
    			type: "settingHistoryIgnoreRemoveItem",
    			value: item
    		});
    	};

    	const click_handler = () => {
    		nadivscode.postMessage({ type: "onRunDeveloperTool", value: null });
    	};

    	const click_handler_1 = () => {
    		nadivscode.postMessage({ type: "onReloadWindow", value: null });
    	};

    	const click_handler_2 = () => {
    		$$invalidate(0, historyIgnorePopOpen = historyIgnorePopOpen ? false : true);
    	};

    	return [
    		historyIgnorePopOpen,
    		cancelRemoveHistoryIgnoreItem,
    		historyIgnoreList,
    		change_handler,
    		click_handler,
    		click_handler_1,
    		click_handler_2
    	];
    }

    class Setting extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    const confirmPop = (text, callback) => {
      const modal = document.createElement("div");
      modal.setAttribute("id", "modalBox");
      modal.addEventListener("click", () => {
        modal.remove();
      });

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
        });
        toolBox.appendChild(buttonCancel);
      }

      bx.appendChild(toolBox);
      modal.appendChild(bx);
      document.body.appendChild(modal);
    };
    const processIndicator = (callback) => {
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
    };

    /* webviews/components/Sidebar.svelte generated by Svelte v3.49.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i][0];
    	child_ctx[6] = list[i][1];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i];
    	return child_ctx;
    }

    // (62:6) {#if value.text != undefined || !isNaN(value.count)}
    function create_if_block(ctx) {
    	let li;
    	let div;
    	let t0_value = /*value*/ ctx[6].text + "";
    	let t0;
    	let t1;
    	let span;
    	let t2_value = /*value*/ ctx[6].count + "";
    	let t2;
    	let t3;
    	let show_if = /*value*/ ctx[6] && /*value*/ ctx[6].hasOwnProperty("list");
    	let t4;
    	let mounted;
    	let dispose;
    	let if_block = show_if && create_if_block_1(ctx);

    	function click_handler_2() {
    		return /*click_handler_2*/ ctx[4](/*key*/ ctx[5]);
    	}

    	return {
    		c() {
    			li = element("li");
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			span = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			if (if_block) if_block.c();
    			t4 = space();
    			attr(span, "class", "badge");
    			attr(div, "class", "title");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, div);
    			append(div, t0);
    			append(div, t1);
    			append(div, span);
    			append(span, t2);
    			append(li, t3);
    			if (if_block) if_block.m(li, null);
    			append(li, t4);

    			if (!mounted) {
    				dispose = listen(li, "click", click_handler_2);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*historyList*/ 1 && t0_value !== (t0_value = /*value*/ ctx[6].text + "")) set_data(t0, t0_value);
    			if (dirty & /*historyList*/ 1 && t2_value !== (t2_value = /*value*/ ctx[6].count + "")) set_data(t2, t2_value);
    			if (dirty & /*historyList*/ 1) show_if = /*value*/ ctx[6] && /*value*/ ctx[6].hasOwnProperty("list");

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(li, t4);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (75:10) {#if value && value.hasOwnProperty("list")}
    function create_if_block_1(ctx) {
    	let ul;
    	let each_value_1 = /*value*/ ctx[6].list;
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "sidebar-history-item-list");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*confirmPop, Object, historyList, processInd, processIndicator, nadivscode, parseInt*/ 3) {
    				each_value_1 = /*value*/ ctx[6].list;
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (93:22) {:else}
    function create_else_block(ctx) {
    	let small;

    	return {
    		c() {
    			small = element("small");
    			small.textContent = "No files changed";
    			attr(small, "class", "italic gray");
    		},
    		m(target, anchor) {
    			insert(target, small, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(small);
    		}
    	};
    }

    // (91:22) {#if parseInt(item.count) > 0}
    function create_if_block_2(ctx) {
    	let span;
    	let t_value = /*item*/ ctx[9].count + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    			attr(span, "class", "badge");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*historyList*/ 1 && t_value !== (t_value = /*item*/ ctx[9].count + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (77:14) {#each value.list as item}
    function create_each_block_1(ctx) {
    	let li;
    	let div1;
    	let div0;
    	let t0_value = /*item*/ ctx[9].text + "";
    	let t0;
    	let t1;
    	let show_if;
    	let t2;
    	let span1;
    	let span0;
    	let t3;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (dirty & /*historyList*/ 1) show_if = null;
    		if (show_if == null) show_if = !!(parseInt(/*item*/ ctx[9].count) > 0);
    		if (show_if) return create_if_block_2;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx, -1);
    	let if_block = current_block_type(ctx);

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[2](/*item*/ ctx[9], ...args);
    	}

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[3](/*item*/ ctx[9]);
    	}

    	return {
    		c() {
    			li = element("li");
    			div1 = element("div");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if_block.c();
    			t2 = space();
    			span1 = element("span");
    			span0 = element("span");
    			span0.innerHTML = `<i class="icon-trash"></i>`;
    			t3 = space();
    			attr(span0, "class", "button del");
    			attr(span1, "class", "tools");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, div1);
    			append(div1, div0);
    			append(div0, t0);
    			append(div0, t1);
    			if_block.m(div0, null);
    			append(div1, t2);
    			append(div1, span1);
    			append(span1, span0);
    			append(li, t3);

    			if (!mounted) {
    				dispose = [
    					listen(div0, "click", click_handler),
    					listen(span0, "click", click_handler_1)
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*historyList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[9].text + "")) set_data(t0, t0_value);

    			if (current_block_type === (current_block_type = select_block_type(ctx, dirty)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (61:4) {#each Object.entries(historyList) as [key, value]}
    function create_each_block(ctx) {
    	let show_if = /*value*/ ctx[6].text != undefined || !isNaN(/*value*/ ctx[6].count);
    	let if_block_anchor;
    	let if_block = show_if && create_if_block(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*historyList*/ 1) show_if = /*value*/ ctx[6].text != undefined || !isNaN(/*value*/ ctx[6].count);

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let h4;
    	let t1;
    	let div;
    	let ul;
    	let t2;
    	let child;
    	let current;
    	let each_value = Object.entries(/*historyList*/ ctx[0]);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	child = new Setting({});

    	return {
    		c() {
    			h4 = element("h4");
    			h4.innerHTML = `<b>Work History</b>`;
    			t1 = space();
    			div = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			create_component(child.$$.fragment);
    			attr(ul, "class", "sidebar-history-list");
    			attr(div, "class", "sidebar-history-box");
    		},
    		m(target, anchor) {
    			insert(target, h4, anchor);
    			insert(target, t1, anchor);
    			insert(target, div, anchor);
    			append(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			insert(target, t2, anchor);
    			mount_component(child, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*nadivscode, Object, historyList, confirmPop, processInd, processIndicator, parseInt, undefined, isNaN*/ 3) {
    				each_value = Object.entries(/*historyList*/ ctx[0]);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(child.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(child.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h4);
    			if (detaching) detach(t1);
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t2);
    			destroy_component(child, detaching);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let historyList = initHistoryList;
    	let processInd = null;

    	onMount(() => {
    		window.addEventListener("message", event => {
    			const message = event.data;

    			switch (message.type) {
    				case "getHistoryOfMonth":
    					if (historyList && historyList.hasOwnProperty(message.value.key)) {
    						$$invalidate(0, historyList[message.value.key].list = message.value.list, historyList);
    					}
    					break;
    				case "stopProcessIndicator":
    					if (typeof processInd === 'object') {
    						try {
    							processInd.remove();
    						} catch(err) {
    							
    						}
    					}
    					break;
    				case "removeDateHistoryOfMonth":
    					if (typeof processInd === 'object') {
    						try {
    							processInd.remove();
    						} catch(err) {
    							
    						}
    					}
    					const dt = new Date(parseInt(message.value.dirname));
    					const histKey = `${dt.getFullYear()}${(dt.getMonth() + 1).toString().padStart(2, "0")}`;
    					var lst = [];
    					historyList[histKey].list.forEach((item, i) => {
    						if (item.dirname !== message.value.dirname) {
    							lst.push(item);
    						}
    					});
    					$$invalidate(0, historyList[histKey].list = lst, historyList);
    					break;
    			}
    		});
    	});

    	const click_handler = (item, e) => {
    		e.preventDefault();
    		$$invalidate(1, processInd = processIndicator());

    		nadivscode.postMessage({
    			type: "onOpenWorkingFilesHistory",
    			value: item.dirname
    		});
    	};

    	const click_handler_1 = item => {
    		confirmPop(`Delete all history of ${item.text}?`, () => {
    			$$invalidate(1, processInd = processIndicator());
    			nadivscode.postMessage({ type: "delHistoryFolder", value: item });
    		});
    	};

    	const click_handler_2 = key => {
    		nadivscode.postMessage({ type: "getHistoryOfMonth", value: key });
    	};

    	return [historyList, processInd, click_handler, click_handler_1, click_handler_2];
    }

    class Sidebar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new Sidebar({
        target: document.body
    });

    return app;

})();
//# sourceMappingURL=Sidebar.js.map
