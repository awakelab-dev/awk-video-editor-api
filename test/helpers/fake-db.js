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
      const dup = this.docs.find((doc) => doc !== excludeDoc && keys.every((k) => doc[k] === newDoc[k]))
      if (dup) {
        const err = new Error('E11000 duplicate key error')
        err.code = 11000
        throw err
      }
    }
  }

  async findOne(filter = {}, options = {}) {
    const doc = this.docs.find((d) => this._matches(d, filter))
    if (!doc) return null
    return this._applyProjection(doc, options.projection)
  }

  async countDocuments(filter = {}) {
    return this.docs.filter((d) => this._matches(d, filter)).length
  }

  find(filter = {}, options = {}) {
    let result = this.docs.filter((d) => this._matches(d, filter)).map((d) => this._applyProjection(d, options.projection))
    const cursor = {
      sort: (spec) => {
        const entries = Object.entries(spec)
        result.sort((a, b) => {
          for (const [key, dir] of entries) {
            if (a[key] < b[key]) return dir < 0 ? 1 : -1
            if (a[key] > b[key]) return dir < 0 ? -1 : 1
          }
          return 0
        })
        return cursor
      },
      limit: (n) => {
        result = result.slice(0, n)
        return cursor
      },
      toArray: async () => result,
    }
    return cursor
  }

  async insertOne(doc) {
    const clone = this._clone(doc)
    this._checkUnique(clone)
    this.docs.push(clone)
    return { insertedId: clone.id || String(this.docs.length) }
  }

  async updateOne(filter, update, options = {}) {
    let doc = this.docs.find((d) => this._matches(d, filter))
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
    const newDoc = this._clone(doc)
    if (update.$set) Object.assign(newDoc, this._clone(update.$set))
    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc)) {
        const current = Number.isSafeInteger(newDoc[key]) ? newDoc[key] : 0
        newDoc[key] = current + value
      }
    }
    if (update.$setOnInsert && !doc) Object.assign(newDoc, this._clone(update.$setOnInsert))
    this._checkUnique(newDoc, doc)
    Object.assign(doc, newDoc)
    return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
  }

  async deleteOne(filter) {
    const index = this.docs.findIndex((d) => this._matches(d, filter))
    if (index === -1) return { deletedCount: 0 }
    this.docs.splice(index, 1)
    return { deletedCount: 1 }
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
