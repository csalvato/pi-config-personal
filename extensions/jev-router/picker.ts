import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Input,
  SelectList,
  Text,
  matchesKey,
  Key,
  type Focusable,
  type SelectListTheme,
} from "@earendil-works/pi-tui";
import type { Picker } from "./extension.ts";

export const pick: Picker = async (ctx, title, items) => {
  if (!items.length || ctx.mode !== "tui") return undefined;
  return ctx.ui.custom<string | undefined>((tui, theme, keybindings, done) => {
    const search = new Input();
    const listContainer = new Container();
    const listTheme: SelectListTheme = {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    };
    let list: SelectList;
    function filter(value: string) {
      const terms = value.toLowerCase().trim().split(/\s+/);
      list = new SelectList(
        items.filter((item) =>
          terms.every((term) =>
            `${item.label} ${item.description ?? ""}`
              .toLowerCase()
              .includes(term),
          ),
        ),
        12,
        listTheme,
      );
      list.onSelect = (item) => done(item.value);
      list.onCancel = () => done(undefined);
      listContainer.clear();
      listContainer.addChild(list);
      tui.requestRender();
    }
    filter("");
    class Picker extends Container implements Focusable {
      get focused() {
        return search.focused;
      }
      set focused(value: boolean) {
        search.focused = value;
      }
      handleInput(data: string) {
        if (
          keybindings.matches(data, "tui.select.cancel") ||
          matchesKey(data, Key.ctrl("c"))
        )
          done(undefined);
        else if (
          keybindings.matches(data, "tui.select.up") ||
          keybindings.matches(data, "tui.select.down") ||
          keybindings.matches(data, "tui.select.confirm")
        )
          list.handleInput(data);
        else {
          const previous = search.getValue();
          search.handleInput(data);
          if (search.getValue() !== previous) filter(search.getValue());
        }
        tui.requestRender();
      }
    }
    const component = new Picker();
    component.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    component.addChild(new Text(title, 1, 0));
    component.addChild(search);
    component.addChild(listContainer);
    component.addChild(
      new Text(
        "Type to filter. Up/down to move. Enter to select. Esc to cancel.",
        1,
        0,
      ),
    );
    component.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    return component;
  });
};
