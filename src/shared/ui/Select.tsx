'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './ui';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
};
type Props = {
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  icon?: string;
  className?: string;
};

export default function Select({
  value,
  options,
  onValueChange,
  label,
  placeholder = 'เลือกรายการ',
  disabled = false,
  icon,
  className = '',
}: Props) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null),
    items = useRef<Array<HTMLDivElement | null>>([]),
    typed = useRef(''),
    typeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(value),
    [position, setPosition] = useState({ left: 12, top: 12, width: 280, maxHeight: 320 });
  const supportsPopover =
    typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
  const selected = options.find((o) => o.value === value),
    enabled = options.filter((o) => !o.disabled),
    activeIndex = Math.max(
      0,
      options.findIndex((o) => o.value === active),
    );
  function close(focus = false) {
    setOpen(false);
    if (focus) trigger.current?.focus({ preventScroll: true });
  }
  function show() {
    if (disabled || !enabled.length) return;
    setActive(selected && !selected.disabled ? value : enabled[0].value);
    setOpen(true);
  }
  function choose(option?: SelectOption) {
    if (!option || option.disabled) return;
    onValueChange(option.value);
    close(true);
  }
  useEffect(() => () => clearTimeout(typeTimer.current), []);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const el = menu.current;
    // Popovers stay above native dialogs and their scrolling content on mobile.
    if (el?.showPopover && !el.matches(':popover-open')) el.showPopover();
    let frame = 0;
    function place() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport,
        w = viewport?.width || innerWidth,
        h = viewport?.height || innerHeight,
        offset = viewport?.offsetTop || 0;
      const width = Math.min(Math.max(rect.width, 280), w - 24),
        below = h + offset - rect.bottom - 12,
        above = rect.top - offset - 12,
        desired = Math.min(350, 60 + options.reduce((n, o) => n + (o.description ? 68 : 50), 0));
      const downward = below >= Math.min(desired, 220) || below >= above,
        maxHeight = Math.max(100, Math.min(desired, downward ? below : above));
      if (el) {
        el.style.width = width + 'px';
        el.style.maxHeight = maxHeight + 'px';
      }
      const height = el?.getBoundingClientRect().height || maxHeight;
      const next = {
        left: Math.max(12, Math.min(rect.left, w - width - 12)),
        top: downward ? rect.bottom + 6 : Math.max(offset + 12, rect.top - height - 6),
        width,
        maxHeight,
      };
      setPosition((old) =>
        Object.keys(next).every((k) => old[k as keyof typeof old] === next[k as keyof typeof next])
          ? old
          : next,
      );
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    }
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) close();
    }
    place();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      if (el?.hidePopover && el.matches(':popover-open')) el.hidePopover();
    };
  }, [open, options]);
  useLayoutEffect(() => {
    if (open) items.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);
  function keydown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!enabled.length) return;
      if (!open) {
        show();
        if (event.key === 'End') setActive(enabled.at(-1)!.value);
        return;
      }
      const index = enabled.findIndex((o) => o.value === active);
      setActive(
        enabled[
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? enabled.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
        ].value,
      );
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(options[activeIndex]);
      else show();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      typed.current += event.key.toLocaleLowerCase();
      clearTimeout(typeTimer.current);
      typeTimer.current = setTimeout(() => {
        typed.current = '';
      }, 700);
      const match = enabled.find((o) =>
        (o.label + ' ' + (o.description || '')).toLocaleLowerCase().startsWith(typed.current),
      );
      if (match) {
        if (!open) show();
        setActive(match.value);
      }
    }
  }
  return (
    <div className={'qa-select ' + className}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? id + '-' + activeIndex : undefined}
        disabled={disabled || !enabled.length}
        className={
          'qa-select-trigger ' +
          (open ? 'is-open' : '') +
          (selected?.description ? ' has-description' : '')
        }
        onClick={() => (open ? close() : show())}
        onKeyDown={keydown}
      >
        {icon ? (
          <span className="qa-select-icon">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <span className="qa-select-value">
          <strong>{selected?.label || placeholder}</strong>
          {selected?.description ? <small>{selected.description}</small> : null}
        </span>
        <Icon name="down" size={17} className="qa-select-chevron" />
      </button>
      {open ? (
        <div
          ref={menu}
          popover={supportsPopover ? 'manual' : undefined}
          id={id}
          role="listbox"
          aria-label={label}
          className="qa-select-menu"
          style={position}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="qa-select-menu-heading">
            <span>{label}</span>
            <span>{options.length} รายการ</span>
          </div>
          <div className="qa-select-options">
            {options.map((option, index) => (
              <div
                ref={(el) => {
                  items.current[index] = el;
                }}
                key={option.value}
                id={id + '-' + index}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={
                  'qa-select-option ' +
                  (option.value === value ? 'is-selected ' : '') +
                  (index === activeIndex ? 'is-active ' : '') +
                  (option.disabled ? 'is-disabled' : '')
                }
                onPointerMove={() => {
                  if (!option.disabled && active !== option.value) setActive(option.value);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse') e.preventDefault();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  choose(option);
                }}
              >
                <span className="qa-select-option-text">
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
                {option.badge ? (
                  <span className="qa-select-option-badge">{option.badge}</span>
                ) : null}
                <span className="qa-select-check">
                  {option.value === value ? <Icon name="check" size={18} /> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
