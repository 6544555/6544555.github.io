import { describe, expect, it } from 'vitest'
import {
  PHOTO_FRAME_CLASSES,
  photoCardClass,
} from '../src/ui/PhotoWall'

describe('photo wall composition', () => {
  it('cycles through five editorial frames', () => {
    expect(PHOTO_FRAME_CLASSES).toHaveLength(5)
    expect(new Set(PHOTO_FRAME_CLASSES).size).toBe(5)
  })

  it('combines landscape, square, tall, and offset rhythms', () => {
    expect(photoCardClass(0)).toContain('photo-landscape')
    expect(photoCardClass(2)).toContain('photo-square')
    expect(photoCardClass(3)).toContain('photo-tall')
    expect(photoCardClass(4)).toContain('photo-offset')
  })

  it('keeps the recently added marker deterministic', () => {
    expect(photoCardClass(1, true)).toContain('frame-matte')
    expect(photoCardClass(1, true)).toContain('is-new')
    expect(photoCardClass(1, false)).not.toContain('is-new')
  })
})
