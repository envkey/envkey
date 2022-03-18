
const VALID_ENVKEY = "ekAc8p6PiPp1Di7nQu5vGomx-qXknocWWVYqyVMaxaBco12",
  INVALID_ENVKEY = "ekunDrefdPeELwPpupdzJpsz-2Hs3HCiscoY1TfGinvalid",
  INVALID_ENVKEY2 = "ekunDrefdPeELwPpuinvalid-2Hs3HCiscoY1TfGcVdefum",
  INVALID_ENVKEY3 = "invalid"

function clearEnv(){
  delete process.env.ENVKEY
  delete process.env.TEST
  delete process.env.TEST_2
}

test('it should load and decrypt environment via require autoload', () => {
  process.env.ENVKEY = VALID_ENVKEY
  require("../index.js")
  expect(process.env.TEST).toBe("it")
  expect(process.env.TEST_2).toBe("works!")
  clearEnv()
})

test('it should load and decrypt environment via loader - synchronously', () => {
  process.env.ENVKEY = VALID_ENVKEY
  var loader = require("../loader.js")
  loader.load()
  expect(process.env.TEST).toBe("it")
  expect(process.env.TEST_2).toBe("works!")
  clearEnv()
})

test('it should load and decrypt environment via loader - async', done => {
  process.env.ENVKEY = VALID_ENVKEY
  var loader = require("../loader.js")
  loader.load((err, res)=> {
    expect(err).toBeFalsy()
    expect(process.env.TEST).toBe("it")
    expect(process.env.TEST_2).toBe("works!")
    clearEnv()
    done()
  })
})

test('it should raise an error with an invalid envkey - synchronously', ()=> {
  process.env.ENVKEY = INVALID_ENVKEY
  expect(()=> {
    var loader = require("../loader.js")
    loader.load()
  }).toThrow(/ENVKEY invalid/)
  clearEnv()

  process.env.ENVKEY = INVALID_ENVKEY2
  expect(()=> {
    var loader = require("../loader.js")
    loader.load()
  }).toThrow(/ENVKEY invalid/)
  clearEnv()

  process.env.ENVKEY = INVALID_ENVKEY3
  expect(()=> {
    var loader = require("../loader.js")
    loader.load()
  }).toThrow(/ENVKEY invalid/)
  clearEnv()
})

test('it should call callback with an err - async', done => {
  process.env.ENVKEY = INVALID_ENVKEY

  var loader = require("../loader.js")
  loader.load((err, res)=> {
    expect(err).not.toBeUndefined()
    expect(process.env.TEST).toBeUndefined()
    expect(process.env.TEST_2).toBeUndefined()
    clearEnv()
    done()
  })
})

test('it should load and decrypt environment via fetch - synchronously', () => {
  process.env.ENVKEY = VALID_ENVKEY
  var loader = require("../loader.js"),
      res = loader.fetch()
  expect(res.TEST).toBe("it")
  expect(res.TEST_2).toBe("works!")
  clearEnv()
})

test('it should load and decrypt environment via fetch - asynchronously', done => {
  process.env.ENVKEY = VALID_ENVKEY
  var loader = require("../loader.js")
  loader.fetch((err, res)=> {
    expect(err).toBeFalsy()
    expect(res.TEST).toBe("it")
    expect(res.TEST_2).toBe("works!")
    clearEnv()
    done()
  })
})

test('fetch should raise an error with an invalid envkey - synchronously', ()=> {
  process.env.ENVKEY = INVALID_ENVKEY
  expect(()=> {
    var loader = require("../loader.js")
    loader.fetch()
  }).toThrow(/ENVKEY invalid/)
  clearEnv()
})

test('fetch should call callback with an invalid envkey - async', done => {
  process.env.ENVKEY = INVALID_ENVKEY
  var loader = require("../loader.js")
  loader.fetch((err, res)=>{
    expect(err).not.toBeUndefined()
    expect(res).toBeUndefined()
    clearEnv()
    done()
  })
})

test('it should not overwrite an existing process.env var', () => {
  process.env.ENVKEY = VALID_ENVKEY
  process.env.TEST = "otherthing"
  var loader = require("../loader.js")
  loader.load()
  expect(process.env.TEST).toBe("otherthing")
  expect(process.env.TEST_2).toBe("works!")
  clearEnv()
})

test('it should not overwrite an existing process.env var even when falsy', () => {
  process.env.ENVKEY = VALID_ENVKEY
  process.env.TEST = ""
  var loader = require("../loader.js")
  loader.load()
  expect(process.env.TEST).toBe("")
  expect(process.env.TEST_2).toBe("works!")
  clearEnv()
})

test('it uses allow-list with "permitted" option', () => {
  process.env.ENVKEY = VALID_ENVKEY
  var loader = require("../loader.js")
  loader.load({permitted: ["TEST"]})
  expect(process.env.TEST).toBe("it")
  expect(process.env.TEST_2).toBeUndefined()
  clearEnv()
})

test('it not ovewrrite existing process.env var with "permitted" option', () => {
  process.env.ENVKEY = VALID_ENVKEY
  process.env.TEST = "otherthing"
  var loader = require("../loader.js")
  loader.load({permitted: ["TEST"]})
  expect(process.env.TEST).toBe("otherthing")
  expect(process.env.TEST_2).toBeUndefined()
  clearEnv()
})

