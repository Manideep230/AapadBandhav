import os
import uuid
import datetime
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import or_, and_, desc

class MongoQuery:
    def __init__(self, model_class, db, session=None):
        self.model_class = model_class
        self.collection = db[model_class.__tablename__]
        self.db = db
        self.session = session
        self.filters = []
        self.order_by_fields = []
        self.limit_val = None
        self.offset_val = None

    def filter(self, *criterion):
        for crit in criterion:
            if crit is not None:
                self.filters.append(crit)
        return self

    def order_by(self, *criterion):
        for crit in criterion:
            if crit is not None:
                self.order_by_fields.append(crit)
        return self

    def limit(self, val):
        self.limit_val = val
        return self

    def offset(self, val):
        self.offset_val = val
        return self

    def _build_filter(self):
        from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList
        
        def to_mongo_query(expr):
            if expr is None: return {}
            if isinstance(expr, bool): return {}
            
            if isinstance(expr, BooleanClauseList):
                op_name = getattr(expr.operator, '__name__', '')
                clauses = [to_mongo_query(c) for c in expr.clauses]
                if 'or_' in op_name:
                    return {"$or": [c for c in clauses if c]}
                else:
                    merged = {}
                    for c in clauses:
                        for k, v in c.items():
                            if k in merged:
                                if isinstance(merged[k], dict) and isinstance(v, dict):
                                    merged[k].update(v)
                                else:
                                    if "$and" not in merged:
                                        merged["$and"] = []
                                    merged["$and"].append({k: v})
                            else:
                                merged[k] = v
                    return merged

            if isinstance(expr, BinaryExpression):
                left = expr.left
                right = expr.right
                op_name = getattr(expr.operator, '__name__', '')
                field_name = getattr(left, 'name', None)
                if not field_name: return {}
                
                val = None
                if hasattr(right, 'value'):
                    val = right.value
                elif hasattr(right, 'element') and hasattr(right.element, 'value'):
                    val = right.element.value
                else:
                    val = right

                val_class = val.__class__.__name__
                if val_class == 'True_': val = True
                elif val_class == 'False_': val = False
                elif val_class == 'Null' or val_class == 'None_': val = None

                if 'eq' in op_name:
                    return {field_name: val}
                elif 'ne' in op_name:
                    return {field_name: {"$ne": val}}
                elif 'lt' in op_name:
                    return {field_name: {"$lt": val}}
                elif 'le' in op_name:
                    return {field_name: {"$lte": val}}
                elif 'gt' in op_name:
                    return {field_name: {"$gt": val}}
                elif 'ge' in op_name:
                    return {field_name: {"$gte": val}}
                elif 'in_op' in op_name:
                    if hasattr(val, 'clauses'):
                        val_list = [c.value if hasattr(c, 'value') else c for c in val.clauses]
                    else:
                        val_list = val
                    resolved = []
                    for it in (val_list if isinstance(val_list, (list, tuple, set)) else [val_list]):
                        it_cls = it.__class__.__name__
                        if it_cls == 'True_': resolved.append(True)
                        elif it_cls == 'False_': resolved.append(False)
                        elif it_cls == 'Null' or it_cls == 'None_': resolved.append(None)
                        else: resolved.append(it)
                    return {field_name: {"$in": resolved}}
                elif 'not_in_op' in op_name:
                    if hasattr(val, 'clauses'):
                        val_list = [c.value if hasattr(c, 'value') else c for c in val.clauses]
                    else:
                        val_list = val
                    resolved = []
                    for it in (val_list if isinstance(val_list, (list, tuple, set)) else [val_list]):
                        it_cls = it.__class__.__name__
                        if it_cls == 'True_': resolved.append(True)
                        elif it_cls == 'False_': resolved.append(False)
                        elif it_cls == 'Null' or it_cls == 'None_': resolved.append(None)
                        else: resolved.append(it)
                    return {field_name: {"$nin": resolved}}
                else:
                    return {field_name: val}
            return {}

        query_dict = {}
        for f in self.filters:
            q = to_mongo_query(f)
            for k, v in q.items():
                if k in query_dict:
                    if isinstance(query_dict[k], dict) and isinstance(v, dict):
                        query_dict[k].update(v)
                    else:
                        if "$and" not in query_dict:
                            query_dict["$and"] = []
                        query_dict["$and"].append({k: v})
                else:
                    query_dict[k] = v
        return query_dict

    def _execute(self):
        query_dict = self._build_filter()
        cursor = self.collection.find(query_dict)
        
        if self.order_by_fields:
            from sqlalchemy.sql.elements import UnaryExpression
            sort_list = []
            for field in self.order_by_fields:
                if isinstance(field, UnaryExpression):
                    modifier_name = getattr(field.modifier, '__name__', '')
                    col_name = getattr(field.element, 'name', None)
                    if col_name:
                        direction = -1 if 'desc' in modifier_name else 1
                        sort_list.append((col_name, direction))
                else:
                    col_name = getattr(field, 'name', None)
                    if col_name:
                        sort_list.append((col_name, 1))
            if sort_list:
                cursor = cursor.sort(sort_list)

        if self.limit_val is not None:
            cursor = cursor.limit(self.limit_val)

        if self.offset_val is not None:
            cursor = cursor.skip(self.offset_val)
            
        return cursor

    def _document_to_instance(self, doc):
        if doc is None:
            return None
        doc.pop('_id', None)
        instance = self.model_class()
        
        for col in self.model_class.__mapper__.columns:
            val = doc.get(col.name)
            if val is None and col.default is not None:
                if col.default.is_scalar:
                    val = col.default.arg
            setattr(instance, col.name, val)
            
        for k, v in doc.items():
            if not hasattr(instance, k):
                setattr(instance, k, v)
                
        original_data = {}
        for col in self.model_class.__mapper__.columns:
            original_data[col.name] = getattr(instance, col.name, None)
        instance._original_data = original_data

        if self.session:
            self.session.add(instance)
            
        return instance

    def first(self):
        docs = list(self._execute().limit(1))
        if docs:
            return self._document_to_instance(docs[0])
        return None

    def all(self):
        docs = list(self._execute())
        return [self._document_to_instance(doc) for doc in docs]

    def count(self):
        query_dict = self._build_filter()
        return self.collection.count_documents(query_dict)

    def delete(self):
        query_dict = self._build_filter()
        self.collection.delete_many(query_dict)

    def update(self, values):
        query_dict = self._build_filter()
        update_dict = {}
        if isinstance(values, dict):
            for k, v in values.items():
                k_str = k.name if hasattr(k, 'name') else str(k)
                update_dict[k_str] = v
        else:
            for k, v in values:
                k_str = k.name if hasattr(k, 'name') else str(k)
                update_dict[k_str] = v
        self.collection.update_many(query_dict, {"$set": update_dict})

class MongoSession:
    def __init__(self, db):
        self.db = db
        self.pending_instances = []

    def query(self, model_class):
        return MongoQuery(model_class, self.db, self)

    def add(self, instance):
        if instance not in self.pending_instances:
            self.pending_instances.append(instance)

    def delete(self, instance):
        if hasattr(instance, '__tablename__'):
            coll = self.db[instance.__tablename__]
            if hasattr(instance, 'id') and instance.id:
                coll.delete_one({"id": instance.id})
        if instance in self.pending_instances:
            self.pending_instances.remove(instance)

    def commit(self):
        for instance in self.pending_instances:
            if hasattr(instance, '__tablename__'):
                coll = self.db[instance.__tablename__]
                data = {}
                for col in instance.__class__.__mapper__.columns:
                    val = getattr(instance, col.name, None)
                    if val is None and col.default is not None:
                        if col.default.is_scalar:
                            val = col.default.arg
                        elif col.default.is_callable:
                            val = col.default.arg(None)
                        setattr(instance, col.name, val)
                            
                    if isinstance(val, datetime.datetime):
                        pass
                    elif isinstance(val, (datetime.date, datetime.time)):
                        val = str(val)
                    elif val.__class__.__name__ == 'Decimal':
                        val = float(val)
                    data[col.name] = val
                
                original = getattr(instance, '_original_data', None)
                if original:
                    changed = False
                    for k, v in data.items():
                        if original.get(k) != v:
                            changed = True
                            break
                    if not changed:
                        continue
                
                if hasattr(instance, 'id') and instance.id:
                    coll.replace_one({"id": instance.id}, data, upsert=True)
                else:
                    if not getattr(instance, 'id', None):
                        instance.id = str(uuid.uuid4())
                        data['id'] = instance.id
                    coll.insert_one(data)
                
                # Update original data copy to reflect the committed state
                original_data = {}
                for col in instance.__class__.__mapper__.columns:
                    original_data[col.name] = getattr(instance, col.name, None)
                instance._original_data = original_data

    def flush(self):
        self.commit()

    def rollback(self):
        pass

    def close(self):
        self.pending_instances = []

DB_DIALECT = os.getenv("DB_DIALECT", "sqlite")
if DB_DIALECT == "mongodb":
    from pymongo import MongoClient
    import urllib.parse
    mongo_uri = os.getenv("MONGODB_URI", "mongodb+srv://manideep:manideep@cluster0.rtoosny.mongodb.net/")
    parsed_uri = urllib.parse.urlparse(mongo_uri)
    db_name = parsed_uri.path.strip("/")
    if not db_name:
        db_name = "aapadbandhav"
    mongo_client = MongoClient(mongo_uri)
    mongo_db = mongo_client[db_name]
    print(f"MongoDB connected to database: {db_name}")
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SessionLocal = lambda: MongoSession(mongo_db)
else:
    if DB_DIALECT == "postgres":
        db_uri = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'postgres')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'aapadbandhav_db')}"
    else:
        db_uri = "sqlite:///database.sqlite"
    engine = create_engine(db_uri, connect_args={"check_same_thread": False} if "sqlite" in db_uri else {})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    from flask import g
    try:
        if 'db' not in g:
            g.db = SessionLocal()
        return g.db
    except RuntimeError:
        return SessionLocal()
