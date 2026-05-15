class FakeCollection {
  constructor(name) {
    this.name = name
    this.docs = []
    this.uniqueIndexes = []
  }

  async createIndex(spec, options = {}) {
    if (options.unique) this.uniqueIndexes.push(Object.keys(spec))
    return `${this.name}_${Object.keys(spec).join('_')}`
  }

  _clone(doc) {
    return JSON.parse(JSON.stringify(doc))
  }

  _matches(doc, filter = {}) {
    return Object.entries(filter).every(([key, value]) => {
      const actual = doc[key]
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('$ne' in value) return actual !== value.$ne
        return false
      }
      return actual === value
    })
  }

  _applyProjection(doc, projection) {
    if (!projection) return this._clone(doc)
    const out = this._clone(doc)
    for (const [key, val] of Object.entries(projection)) {
      if (val === 0) delete out[key]
    }
    return out
  }

  _checkUnique(newDoc, excludeDoc = null) {
    for (const keys of this.uniqueIndexes) {
      const duplicate = this.docs.find((doc) => doc !== excludeDoc && keys.every((key) => doc[key] === newDoc[key]))
      if (duplicate) {
        const error = new Error('E11000 duplicate key error')
        error.code = 11000
        throw error
      }
    }
  }

  async findOne(filter = {}, options = {}) {
    const doc = this.docs.find((item) => this._matches(item, filter))
    if (!doc) return null
    return this._applyProjection(doc, options.projection)
  }

  async insertOne(doc) {
    const clone = this._clone(doc)
    this._checkUnique(clone)
    this.docs.push(clone)
    return { insertedId: clone.id || String(this.docs.length) }
  }

  async updateOne(filter, update, options = {}) {
    let doc = this.docs.find((item) => this._matches(item, filter))
    if (!doc && options.upsert) {
      doc = {}
      if (update.$setOnInsert) Object.assign(doc, this._clone(update.$setOnInsert))
      if (update.$set) Object.assign(doc, this._clone(update.$set))
      Object.assign(doc, filter)
      this._checkUnique(doc)
      this.docs.push(doc)
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
    }
    if (!doc) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }

    const nextDoc = this._clone(doc)
    if (update.$set) Object.assign(nextDoc, this._clone(update.$set))
    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc)) {
        const current = Number.isSafeInteger(nextDoc[key]) ? nextDoc[key] : 0
        nextDoc[key] = current + value
      }
    }
    this._checkUnique(nextDoc, doc)
    Object.assign(doc, nextDoc)
    return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
  }
}

class FakeDb {
  constructor() {
    this.collections = new Map()
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new FakeCollection(name))
    }
    return this.collections.get(name)
  }

  async command(cmd) {
    if (cmd && cmd.ping === 1) return { ok: 1 }
    return { ok: 1 }
  }
}

module.exports = { FakeDb }
