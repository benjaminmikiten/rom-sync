import { describe, it, expect } from 'vitest'
import { normalizeTitle } from '../src/main/normalizer'

describe('normalizeTitle', () => {
  it('strips file extension', () => {
    expect(normalizeTitle('Super Metroid (USA).zip')).not.toContain('.zip')
  })

  it('strips region tags', () => {
    expect(normalizeTitle('Super Metroid (USA).zip')).not.toContain('usa')
  })

  it('strips revision markers', () => {
    expect(normalizeTitle('Game (Rev 2).zip')).not.toContain('rev')
    expect(normalizeTitle('Game (Rev A).zip')).not.toContain('rev')
  })

  it('strips version markers', () => {
    expect(normalizeTitle('Game (v1.1).zip')).not.toContain('v1')
  })

  it('lowercases result', () => {
    const result = normalizeTitle('Super Metroid (USA).zip')
    expect(result).toBe(result.toLowerCase())
  })

  it('collapses whitespace', () => {
    expect(normalizeTitle('Game  Title.zip')).not.toContain('  ')
  })

  it('strips punctuation', () => {
    expect(normalizeTitle('Castlevania - Aria of Sorrow (USA).zip'))
      .toBe('castlevania aria of sorrow')
  })

  it('handles plain string without extension', () => {
    expect(normalizeTitle('Metroid Fusion (USA)')).toBe('metroid fusion')
  })

  it('preserves meaningful parenthetical subtitles', () => {
    expect(normalizeTitle('The Legend of Zelda (A Link to the Past) (USA).sfc'))
      .toBe('the legend of zelda a link to the past')
  })
})
