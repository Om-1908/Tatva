import React, { useRef, useState, useEffect } from 'react'
import { motion, MotionConfig } from 'framer-motion'

const springTransition = {
  type: 'spring',
  bounce: 0.1,
  duration: 0.35,
}

export default function DynamicSearch({
  value = '',
  onChange,
  placeholder = 'Search...',
  expandedWidth = '320px',
  collapsedWidth = '180px',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(Boolean(value))
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Auto expand if initial value exists
  useEffect(() => {
    if (value) setIsOpen(true)
  }, [value])

  // Click outside to collapse if empty
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (!value) {
          setIsOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  const handleOpen = () => {
    setIsOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleClose = () => {
    onChange?.('')
    setIsOpen(false)
  }

  return (
    <MotionConfig transition={springTransition}>
      <div ref={containerRef} className={`relative inline-block ${className}`}>
        <motion.div
          animate={{
            width: isOpen ? expandedWidth : collapsedWidth,
          }}
          initial={false}
          className="relative bg-[#07070A] border border-[#1A1A24] hover:border-primary/60 focus-within:border-primary rounded-2xl overflow-hidden transition-colors shadow-md flex items-center h-10 px-3"
        >
          {!isOpen ? (
            <button
              type="button"
              onClick={handleOpen}
              className="w-full flex items-center justify-between gap-2 text-on-surface-variant hover:text-white font-mono text-xs cursor-pointer select-none"
              title={placeholder}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">search</span>
                <span className="truncate opacity-75">{placeholder}</span>
              </div>
              <span className="text-[10px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded font-mono text-outline">⌘K</span>
            </button>
          ) : (
            <div className="flex items-center w-full gap-2 font-mono text-xs">
              <button
                type="button"
                onClick={handleClose}
                className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1 rounded-lg hover:bg-white/5 cursor-pointer"
                title="Close search"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              </button>

              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                placeholder={placeholder}
                className="bg-transparent border-none outline-none text-white text-xs w-full placeholder:text-on-surface-variant/50 font-mono"
              />

              {value && (
                <button
                  type="button"
                  onClick={() => onChange?.('')}
                  className="text-on-surface-variant hover:text-rose-400 transition-colors p-1 rounded-lg cursor-pointer"
                  title="Clear query"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  )
}
