import { useLayoutEffect } from 'react'

export function useRevealSections(): void {
  useLayoutEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('.section')]
    if (sections.length === 0) return

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (reducedMotion || !('IntersectionObserver' in window)) {
      sections.forEach((section) => section.classList.add('is-revealed'))
      return
    }

    sections.forEach((section) => section.classList.add('is-reveal-ready'))

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-revealed')
          observer.unobserve(entry.target)
        })
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -8% 0px',
      },
    )

    sections.forEach((section) => observer.observe(section))

    return () => {
      observer.disconnect()
      sections.forEach((section) => {
        section.classList.remove('is-reveal-ready', 'is-revealed')
      })
    }
  }, [])
}
