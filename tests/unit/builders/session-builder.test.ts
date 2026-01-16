import { describe, it, expect } from 'vitest'
import { OnlineSessionBuilder, BatchSessionBuilder, SessionBuilder } from '@/builders/session-builder'

describe('OnlineSessionBuilder', () => {
  describe('builder pattern', () => {
    it('should build valid online session config', () => {
      const config = OnlineSessionBuilder.create()
        .withNip('1234567890')
        .withDescription('Test online session')
        .withTimeout(1200)
        .build()

      expect(config).toEqual({
        nip: '1234567890',
        description: 'Test online session',
        timeout: 1200,
      })
    })

    it('should apply default timeout', () => {
      const config = OnlineSessionBuilder.create()
        .withNip('1234567890')
        .build()

      expect(config.timeout).toBe(1800) // 30 minutes default
      expect(config.description).toBeUndefined()
    })

    it('should support method chaining', () => {
      const builder = OnlineSessionBuilder.create()
      const result1 = builder.withNip('1234567890')
      const result2 = result1.withDescription('Test')
      const result3 = result2.withTimeout(900)

      expect(result1).toBe(builder)
      expect(result2).toBe(builder)
      expect(result3).toBe(builder)
    })

    it('should support static factory with NIP', () => {
      const config = OnlineSessionBuilder.forNip('1234567890')
        .withDescription('Quick session')
        .build()

      expect(config.nip).toBe('1234567890')
      expect(config.description).toBe('Quick session')
    })
  })

  describe('validation', () => {
    it('should throw error for missing NIP', () => {
      const builder = OnlineSessionBuilder.create().withDescription('Test')

      expect(() => builder.build()).toThrow('Invalid online session configuration')
    })

    it('should throw error for invalid NIP format', () => {
      const builder = OnlineSessionBuilder.create().withNip('123') // Too short

      expect(() => builder.build()).toThrow('NIP must be 10 digits')
    })

    it('should throw error for non-numeric NIP', () => {
      const builder = OnlineSessionBuilder.create().withNip('12345abcde')

      expect(() => builder.build()).toThrow('NIP must be 10 digits')
    })

    it('should throw error for timeout out of range', () => {
      const builder = OnlineSessionBuilder.create()
        .withNip('1234567890')
        .withTimeout(0) // Below minimum

      expect(() => builder.build()).toThrow('Invalid online session configuration')
    })

    it('should throw error for timeout too large', () => {
      const builder = OnlineSessionBuilder.create()
        .withNip('1234567890')
        .withTimeout(4000) // Above maximum

      expect(() => builder.build()).toThrow('Invalid online session configuration')
    })
  })

  describe('edge cases', () => {
    it('should handle empty description', () => {
      const config = OnlineSessionBuilder.create()
        .withNip('1234567890')
        .withDescription('')
        .build()

      expect(config.description).toBe('')
    })

    it('should override previous values', () => {
      const config = OnlineSessionBuilder.create()
        .withNip('1111111111')
        .withNip('2222222222') // Override
        .withTimeout(900)
        .withTimeout(1200) // Override
        .build()

      expect(config.nip).toBe('2222222222')
      expect(config.timeout).toBe(1200)
    })
  })
})

describe('BatchSessionBuilder', () => {
  describe('builder pattern', () => {
    it('should build valid batch session config', () => {
      const config = BatchSessionBuilder.create()
        .withNip('1234567890')
        .withDescription('Test batch session')
        .withTimeout(2400)
        .withMaxParts(50)
        .build()

      expect(config).toEqual({
        nip: '1234567890',
        description: 'Test batch session',
        timeout: 2400,
        maxParts: 50,
      })
    })

    it('should apply default values', () => {
      const config = BatchSessionBuilder.create()
        .withNip('1234567890')
        .build()

      expect(config.timeout).toBe(3600) // 1 hour default
      expect(config.maxParts).toBe(10) // default max parts
      expect(config.description).toBeUndefined()
    })

    it('should support static factory with NIP', () => {
      const config = BatchSessionBuilder.forNip('1234567890')
        .withMaxParts(25)
        .build()

      expect(config.nip).toBe('1234567890')
      expect(config.maxParts).toBe(25)
    })
  })

  describe('validation', () => {
    it('should throw error for missing NIP', () => {
      const builder = BatchSessionBuilder.create().withMaxParts(5)

      expect(() => builder.build()).toThrow('Invalid batch session configuration')
    })

    it('should throw error for maxParts out of range', () => {
      const builder = BatchSessionBuilder.create()
        .withNip('1234567890')
        .withMaxParts(0) // Below minimum

      expect(() => builder.build()).toThrow('Invalid batch session configuration')
    })

    it('should throw error for maxParts too large', () => {
      const builder = BatchSessionBuilder.create()
        .withNip('1234567890')
        .withMaxParts(200) // Above maximum

      expect(() => builder.build()).toThrow('Invalid batch session configuration')
    })

    it('should throw error for timeout too large', () => {
      const builder = BatchSessionBuilder.create()
        .withNip('1234567890')
        .withTimeout(8000) // Above maximum

      expect(() => builder.build()).toThrow('Invalid batch session configuration')
    })
  })

  describe('edge cases', () => {
    it('should handle minimum valid values', () => {
      const config = BatchSessionBuilder.create()
        .withNip('1234567890')
        .withTimeout(1) // Minimum
        .withMaxParts(1) // Minimum
        .build()

      expect(config.timeout).toBe(1)
      expect(config.maxParts).toBe(1)
    })

    it('should handle maximum valid values', () => {
      const config = BatchSessionBuilder.create()
        .withNip('1234567890')
        .withTimeout(7200) // Maximum
        .withMaxParts(100) // Maximum
        .build()

      expect(config.timeout).toBe(7200)
      expect(config.maxParts).toBe(100)
    })
  })
})

describe('SessionBuilder factory', () => {
  describe('static factory methods', () => {
    it('should create online session builder', () => {
      const builder = SessionBuilder.online()
      expect(builder).toBeInstanceOf(OnlineSessionBuilder)
    })

    it('should create batch session builder', () => {
      const builder = SessionBuilder.batch()
      expect(builder).toBeInstanceOf(BatchSessionBuilder)
    })

    it('should create online session builder with NIP', () => {
      const config = SessionBuilder.onlineForNip('1234567890').build()
      expect(config.nip).toBe('1234567890')
    })

    it('should create batch session builder with NIP', () => {
      const config = SessionBuilder.batchForNip('1234567890').build()
      expect(config.nip).toBe('1234567890')
    })
  })

  describe('fluent API integration', () => {
    it('should chain methods from factory', () => {
      const onlineConfig = SessionBuilder.online()
        .withNip('1111111111')
        .withDescription('Online from factory')
        .withTimeout(900)
        .build()

      expect(onlineConfig).toEqual({
        nip: '1111111111',
        description: 'Online from factory',
        timeout: 900,
      })
    })

    it('should chain methods from factory with NIP', () => {
      const batchConfig = SessionBuilder.batchForNip('2222222222')
        .withDescription('Batch from factory')
        .withMaxParts(20)
        .build()

      expect(batchConfig).toEqual({
        nip: '2222222222',
        description: 'Batch from factory',
        timeout: 3600, // default
        maxParts: 20,
      })
    })
  })
})