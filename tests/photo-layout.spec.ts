import { describe, expect, it } from 'vitest'
import {
  PHOTO_FRAME_CLASSES,
  photoCardClass,
  photoColumnBuckets,
  photoColumnCount,
  photoLayoutGroups,
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

  it('groups each full-width feature with the following column photos', () => {
    expect(photoLayoutGroups(0)).toEqual([])
    expect(photoLayoutGroups(8)).toEqual([
      [0, 1, 2, 3, 4, 5, 6],
      [7],
    ])
    expect(photoLayoutGroups(10)[1]).toEqual([7, 8, 9])
  })

  it('uses two, three, and four columns at the responsive breakpoints', () => {
    expect(photoColumnCount(375)).toBe(2)
    expect(photoColumnCount(768)).toBe(3)
    expect(photoColumnCount(1440)).toBe(4)
  })

  it('balances photos across every available column', () => {
    const buckets = photoColumnBuckets([1, 2, 3, 4, 5, 6], 4)
    expect(buckets).toHaveLength(4)
    expect(buckets.every((bucket) => bucket.length > 0)).toBe(true)
    expect(buckets.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
  })
})
