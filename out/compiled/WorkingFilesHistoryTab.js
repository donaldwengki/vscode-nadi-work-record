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

    /* webviews/components/WFHTool.svelte generated by Svelte v3.49.0 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	return child_ctx;
    }

    // (22:4) {#each buttons as btn}
    function create_each_block$1(ctx) {
    	let button;
    	let t_value = /*btn*/ ctx[5].title + "";
    	let t;
    	let mounted;
    	let dispose;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[4](/*btn*/ ctx[5], ...args);
    	}

    	return {
    		c() {
    			button = element("button");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			append(button, t);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*buttons*/ 4 && t_value !== (t_value = /*btn*/ ctx[5].title + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div1;
    	let h3;
    	let t0_value = /*data*/ ctx[0].title + "";
    	let t0;
    	let t1;
    	let div0;
    	let span;
    	let t2;
    	let input;
    	let t3;
    	let mounted;
    	let dispose;
    	let each_value = /*buttons*/ ctx[2];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div1 = element("div");
    			h3 = element("h3");
    			t0 = text(t0_value);
    			t1 = space();
    			div0 = element("div");
    			span = element("span");
    			span.innerHTML = `<i class="icon-search"></i>`;
    			t2 = space();
    			input = element("input");
    			t3 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(h3, "class", "wf-title");
    			attr(span, "class", "icon");
    			attr(input, "type", "text");
    			attr(div0, "class", "search-box");
    			attr(div1, "class", "panel");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, h3);
    			append(h3, t0);
    			append(div1, t1);
    			append(div1, div0);
    			append(div0, span);
    			append(div0, t2);
    			append(div0, input);
    			append(div0, t3);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			if (!mounted) {
    				dispose = listen(input, "keyup", /*keyup_handler*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*data*/ 1 && t0_value !== (t0_value = /*data*/ ctx[0].title + "")) set_data(t0, t0_value);

    			if (dirty & /*buttons*/ 4) {
    				each_value = /*buttons*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { data = { title: "No Title" } } = $$props;
    	let { onSearchCallback } = $$props;
    	let { buttons } = $$props;

    	const keyup_handler = e => {
    		if (onSearchCallback) onSearchCallback(e.target);
    	};

    	const click_handler = (btn, e) => {
    		if (btn.callback) btn.callback(e);
    	};

    	$$self.$$set = $$props => {
    		if ('data' in $$props) $$invalidate(0, data = $$props.data);
    		if ('onSearchCallback' in $$props) $$invalidate(1, onSearchCallback = $$props.onSearchCallback);
    		if ('buttons' in $$props) $$invalidate(2, buttons = $$props.buttons);
    	};

    	return [data, onSearchCallback, buttons, keyup_handler, click_handler];
    }

    class WFHTool extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { data: 0, onSearchCallback: 1, buttons: 2 });
    	}
    }

    /* webviews/components/WorkingFilesHistoryTab.svelte generated by Svelte v3.49.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	return child_ctx;
    }

    // (136:0) {#if targetFolderData && targetFolderData.hasOwnProperty("date")}
    function create_if_block_4(ctx) {
    	let wfhtool;
    	let current;

    	wfhtool = new WFHTool({
    			props: {
    				data: { title: targetFolderData.date },
    				onSearchCallback: /*onSearch*/ ctx[4],
    				buttons: /*toolButtons*/ ctx[2]
    			}
    		});

    	return {
    		c() {
    			create_component(wfhtool.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(wfhtool, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const wfhtool_changes = {};
    			if (dirty & /*toolButtons*/ 4) wfhtool_changes.buttons = /*toolButtons*/ ctx[2];
    			wfhtool.$set(wfhtool_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(wfhtool.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(wfhtool.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(wfhtool, detaching);
    		}
    	};
    }

    // (145:2) {#if targetFolderData && targetFolderData.hasOwnProperty("date") && targetFolderData.hasOwnProperty("key")}
    function create_if_block(ctx) {
    	let ul;
    	let each_value = /*list*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "history-list-collection");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*getDateHour, list, confirmPop, processIndicator, nadivscode, Object, targetFolderData, JSON, selectionItem*/ 11) {
    				each_value = /*list*/ ctx[0];
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
    		d(detaching) {
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (149:10) {#if selectionItem}
    function create_if_block_3(ctx) {
    	let input;
    	let input_value_value;

    	return {
    		c() {
    			input = element("input");
    			attr(input, "type", "checkbox");
    			attr(input, "class", "item-checkbox");
    			attr(input, "name", "item[]");
    			input.value = input_value_value = JSON.stringify(/*item*/ ctx[13]);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*list*/ 1 && input_value_value !== (input_value_value = JSON.stringify(/*item*/ ctx[13]))) {
    				input.value = input_value_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    		}
    	};
    }

    // (222:16) {#if item && item.hasOwnProperty("rename")}
    function create_if_block_2(ctx) {
    	let span;
    	let t0_value = /*getDateHour*/ ctx[3](/*item*/ ctx[13].rename) + "";
    	let t0;
    	let t1;

    	return {
    		c() {
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = text(" -> new/rename");
    			attr(span, "class", "info-rename");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*list*/ 1 && t0_value !== (t0_value = /*getDateHour*/ ctx[3](/*item*/ ctx[13].rename) + "")) set_data(t0, t0_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (227:16) {#if item && item.hasOwnProperty("change")}
    function create_if_block_1(ctx) {
    	let span;
    	let t0_value = /*getDateHour*/ ctx[3](/*item*/ ctx[13].change) + "";
    	let t0;
    	let t1;

    	return {
    		c() {
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = text(" -> last change");
    			attr(span, "class", "info-change");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*list*/ 1 && t0_value !== (t0_value = /*getDateHour*/ ctx[3](/*item*/ ctx[13].change) + "")) set_data(t0, t0_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (147:6) {#each list as item}
    function create_each_block(ctx) {
    	let li;
    	let t0;
    	let div2;
    	let div0;
    	let span0;
    	let t1_value = /*item*/ ctx[13].rpath + "";
    	let t1;
    	let t2;
    	let span4;
    	let span1;
    	let t3;
    	let span2;
    	let t4;
    	let span3;
    	let t5;
    	let div1;
    	let small;
    	let show_if_1 = /*item*/ ctx[13] && /*item*/ ctx[13].hasOwnProperty("rename");
    	let t6;
    	let show_if = /*item*/ ctx[13] && /*item*/ ctx[13].hasOwnProperty("change");
    	let t7;
    	let mounted;
    	let dispose;
    	let if_block0 = /*selectionItem*/ ctx[1] && create_if_block_3(ctx);

    	function click_handler() {
    		return /*click_handler*/ ctx[5](/*item*/ ctx[13]);
    	}

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[6](/*item*/ ctx[13]);
    	}

    	function click_handler_2() {
    		return /*click_handler_2*/ ctx[7](/*item*/ ctx[13]);
    	}

    	function click_handler_3() {
    		return /*click_handler_3*/ ctx[8](/*item*/ ctx[13]);
    	}

    	let if_block1 = show_if_1 && create_if_block_2(ctx);
    	let if_block2 = show_if && create_if_block_1(ctx);

    	return {
    		c() {
    			li = element("li");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div2 = element("div");
    			div0 = element("div");
    			span0 = element("span");
    			t1 = text(t1_value);
    			t2 = space();
    			span4 = element("span");
    			span1 = element("span");
    			span1.innerHTML = `<i class="icon-file-text"></i>`;
    			t3 = space();
    			span2 = element("span");
    			span2.innerHTML = `<i class="icon-external-link-sign"></i>`;
    			t4 = space();
    			span3 = element("span");
    			span3.innerHTML = `<i class="icon-trash"></i>`;
    			t5 = space();
    			div1 = element("div");
    			small = element("small");
    			if (if_block1) if_block1.c();
    			t6 = space();
    			if (if_block2) if_block2.c();
    			t7 = space();
    			attr(span0, "class", "info-path");
    			attr(span1, "class", "button open-file");
    			attr(span2, "class", "button open");
    			attr(span3, "class", "button del");
    			attr(span4, "class", "tools");
    			attr(div0, "class", "list-item-text");
    			attr(div2, "class", "list-item");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			if (if_block0) if_block0.m(li, null);
    			append(li, t0);
    			append(li, div2);
    			append(div2, div0);
    			append(div0, span0);
    			append(span0, t1);
    			append(div0, t2);
    			append(div0, span4);
    			append(span4, span1);
    			append(span4, t3);
    			append(span4, span2);
    			append(span4, t4);
    			append(span4, span3);
    			append(div2, t5);
    			append(div2, div1);
    			append(div1, small);
    			if (if_block1) if_block1.m(small, null);
    			append(small, t6);
    			if (if_block2) if_block2.m(small, null);
    			append(li, t7);

    			if (!mounted) {
    				dispose = [
    					listen(span0, "click", click_handler),
    					listen(span1, "click", click_handler_1),
    					listen(span2, "click", click_handler_2),
    					listen(span3, "click", click_handler_3)
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (/*selectionItem*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					if_block0.m(li, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*list*/ 1 && t1_value !== (t1_value = /*item*/ ctx[13].rpath + "")) set_data(t1, t1_value);
    			if (dirty & /*list*/ 1) show_if_1 = /*item*/ ctx[13] && /*item*/ ctx[13].hasOwnProperty("rename");

    			if (show_if_1) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(small, t6);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty & /*list*/ 1) show_if = /*item*/ ctx[13] && /*item*/ ctx[13].hasOwnProperty("change");

    			if (show_if) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_1(ctx);
    					if_block2.c();
    					if_block2.m(small, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let h2;
    	let t1;
    	let show_if_1 = targetFolderData && targetFolderData.hasOwnProperty("date");
    	let t2;
    	let div;
    	let show_if = targetFolderData && targetFolderData.hasOwnProperty("date") && targetFolderData.hasOwnProperty("key");
    	let current;
    	let if_block0 = show_if_1 && create_if_block_4(ctx);
    	let if_block1 = show_if && create_if_block(ctx);

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Working File History";
    			t1 = space();
    			if (if_block0) if_block0.c();
    			t2 = space();
    			div = element("div");
    			if (if_block1) if_block1.c();
    			attr(div, "class", "container");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t2, anchor);
    			insert(target, div, anchor);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (show_if_1) if_block0.p(ctx, dirty);
    			if (show_if) if_block1.p(ctx, dirty);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t2);
    			if (detaching) detach(div);
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let projectFileHistory = workFilesHistory;
    	let historyCollections = {};
    	let list = [];

    	if (targetFolderData && targetFolderData.hasOwnProperty("key")) {
    		list = projectFileHistory[targetFolderData.key];
    	}

    	let getDateHour = time => {
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
    			"Dec"
    		];

    		const dirnameToDate = new Date(time);
    		var dd = String(dirnameToDate.getDate()).padStart(2, "0");
    		var mmm = month[dirnameToDate.getMonth()];
    		var yyyy = dirnameToDate.getFullYear();
    		return `${mmm} ${dd}, ${yyyy} ${String(dirnameToDate.getHours()).padStart(2, "0")}:${String(dirnameToDate.getMinutes()).padStart(2, "0")}`;
    	};

    	onMount(() => {
    		window.addEventListener("message", event => {
    			switch (event.data.type) {
    				case "receiveHistoryCollections":
    					historyCollections = Object.assign(historyCollections, event.data.value);
    					break;
    			}
    		});
    	});

    	const onSearch = e => {
    		const fltr = projectFileHistory[targetFolderData.key].filter(item => item.rpath.includes(e.value));
    		$$invalidate(0, list = fltr);
    	};

    	let selectionItem = false;
    	let checkedAll = false;

    	const buttons = [
    		{
    			title: "Refresh",
    			callback: e => {
    				processIndicator();

    				nadivscode.postMessage({
    					type: "updateWindow",
    					value: targetFolderData.key
    				});
    			}
    		},
    		{
    			title: "Show Selection",
    			callback: e => {
    				$$invalidate(1, selectionItem = !selectionItem ? true : false);

    				if (selectionItem) {
    					toolButtons.push({
    						title: "Select All",
    						callback: ei => {
    							checkedAll = !checkedAll ? true : false;

    							if (checkedAll) {
    								ei.target.innerText = "Unselect All";

    								document.querySelectorAll(".item-checkbox").forEach(checkBox => {
    									checkBox.checked = true;
    								});
    							} else {
    								document.querySelectorAll(".item-checkbox").forEach(checkBox => {
    									checkBox.checked = false;
    								});

    								ei.target.innerText = "Select All";
    							}
    						}
    					});

    					toolButtons.push({
    						title: "Delete",
    						callback: eii => {
    							const bulkDel = [];

    							document.querySelectorAll(".item-checkbox").forEach(checkBox => {
    								if (checkBox.checked) {
    									bulkDel.push(JSON.parse(checkBox.value));
    								}
    							});

    							if (bulkDel.length > 0) {
    								confirmPop(
    									`Delete ${bulkDel.length > 1
									? bulkDel.length + " items"
									: bulkDel.length + " item"} from "${targetFolderData.date}" history data?`,
    									() => {
    										processIndicator();

    										nadivscode.postMessage({
    											type: "deleteBulkHistoryFile",
    											value: {
    												list: bulkDel,
    												dirname: targetFolderData.key
    											}
    										});
    									}
    								);
    							} else {
    								confirmPop("No data selected!");
    							}
    						}
    					});

    					$$invalidate(2, toolButtons = buttons);
    					e.target.innerText = "Hide Selection";
    				} else {
    					$$invalidate(2, toolButtons = [buttons[0]]);
    					e.target.innerText = "Show Selection";
    				}
    			}
    		}
    	];

    	let toolButtons = buttons;

    	nadivscode.postMessage({
    		type: "sidebarStopProcessIndicator",
    		value: null
    	});

    	const click_handler = item => {
    		nadivscode.postMessage({
    			type: "seeHistoryFileDiff",
    			value: Object.assign(item, { dirname: targetFolderData.key })
    		});
    	};

    	const click_handler_1 = item => {
    		nadivscode.postMessage({
    			type: "openFileEditor",
    			value: Object.assign(item, { dirname: targetFolderData.key })
    		});
    	};

    	const click_handler_2 = item => {
    		nadivscode.postMessage({
    			type: "seeHistoryFileDiff",
    			value: Object.assign(item, { dirname: targetFolderData.key })
    		});
    	};

    	const click_handler_3 = item => {
    		confirmPop(`Delete "${item.rpath}" from working history?`, () => {
    			processIndicator();

    			nadivscode.postMessage({
    				type: "deleteHistoryFile",
    				value: Object.assign(item, { dirname: targetFolderData.key })
    			});
    		});
    	};

    	return [
    		list,
    		selectionItem,
    		toolButtons,
    		getDateHour,
    		onSearch,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3
    	];
    }

    class WorkingFilesHistoryTab extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new WorkingFilesHistoryTab({
        target: document.body
    });

    return app;

})();
//# sourceMappingURL=WorkingFilesHistoryTab.js.map
