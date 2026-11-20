const ApiError = require('../utils/ApiError');
const {
  asyncHandler,
  ok,
  created,
  escapeRegex,
  parsePagination,
  buildPagination,
  parseSort,
} = require('../utils/helpers');

/**
 * Builds list/get/create/update/remove handlers for a Mongoose model.
 *
 * options:
 *  label          Human name used in messages
 *  searchFields   Fields matched (case-insensitive substring) by ?search=
 *  filterFields   Query params applied as exact-match filters
 *  sortFields     Whitelist for ?sortBy=
 *  defaultSort    Sort when ?sortBy is missing
 *  populate       Mongoose populate spec
 *  decorateList   async (plainDocs) => plainDocs        (e.g. attach aggregates)
 *  decorateOne    async (plainDoc)  => plainDoc
 *  beforeSave     async (data, { req, doc }) => void    (cross-document validation)
 *  beforeDelete   async (doc, { req }) => void          (throw to block deletion)
 *  afterDelete    async (doc) => void
 */
function createCrudController(options) {
  const {
    Model,
    label,
    searchFields = [],
    filterFields = [],
    sortFields = [],
    defaultSort = { createdAt: -1 },
    populate,
    decorateList,
    decorateOne,
    beforeSave,
    beforeDelete,
    afterDelete,
  } = options;

  const withPopulate = (q) => (populate ? q.populate(populate) : q);

  const list = asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    for (const f of filterFields) {
      if (req.query[f] !== undefined && req.query[f] !== '') filter[f] = req.query[f];
    }
    if (req.query.search && searchFields.length) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    const sort = parseSort(req.query, sortFields, defaultSort);

    const [docs, total] = await Promise.all([
      withPopulate(Model.find(filter).sort(sort).skip(skip).limit(limit)),
      Model.countDocuments(filter),
    ]);
    let data = docs.map((d) => d.toJSON());
    if (decorateList) data = await decorateList(data);
    return ok(res, data, undefined, 200, { pagination: buildPagination(total, page, limit) });
  });

  const getOne = asyncHandler(async (req, res) => {
    const doc = await withPopulate(Model.findById(req.params.id));
    if (!doc) throw ApiError.notFound(`${label} not found`);
    let data = doc.toJSON();
    if (decorateOne) data = await decorateOne(data);
    return ok(res, data);
  });

  const create = asyncHandler(async (req, res) => {
    if (beforeSave) await beforeSave(req.body, { req, doc: null });
    const doc = await Model.create(req.body);
    const full = await withPopulate(Model.findById(doc._id));
    return created(res, full.toJSON(), `${label} created`);
  });

  const update = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound(`${label} not found`);
    if (beforeSave) await beforeSave(req.body, { req, doc });
    doc.set(req.body);
    await doc.save();
    const full = await withPopulate(Model.findById(doc._id));
    return ok(res, full.toJSON(), `${label} updated`);
  });

  const remove = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound(`${label} not found`);
    if (beforeDelete) await beforeDelete(doc, { req });
    await doc.deleteOne();
    if (afterDelete) await afterDelete(doc);
    return ok(res, { _id: doc._id }, `${label} deleted`);
  });

  return { list, getOne, create, update, remove };
}

module.exports = { createCrudController };
