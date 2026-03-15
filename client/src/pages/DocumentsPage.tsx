import { useState, useEffect, useCallback } from 'react';
import {
  Typography, Upload, Button, Table, Modal, message, Tag, Card,
} from 'antd';
import type { UploadProps, TableColumnsType } from 'antd';
import { DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { fetchDocuments, uploadDocument, deleteDocument } from '../api';
import type { DocumentItem } from '../types';

const { Title } = Typography;
const { Dragger } = Upload;

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.html', '.pdf'];
const MAX_FILE_SIZE_MB = 20;

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  uploaded: { color: 'blue', text: '已上传' },
  cleaning: { color: 'processing', text: '清洗中' },
  cleaned: { color: 'processing', text: '清洗完成' },
  splitting: { color: 'processing', text: '拆分中' },
  completed: { color: 'green', text: '成功' },
  failed: { color: 'red', text: '失败' },
};

const PAGE_SIZE = 10;

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDocuments();
      setDocs(data);
    } catch (err: any) {
      message.error(err.message || '获取文档列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    const hasProcessing = docs.some(d => d.status !== 'completed' && d.status !== 'failed');
    if (!hasProcessing) return;

    const timer = setInterval(loadDocs, 5000);
    return () => clearInterval(timer);
  }, [docs, loadDocs]);

  const handleDelete = (doc: DocumentItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除文档「${doc.filename}」吗？删除后不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteDocument(doc.doc_id);
          message.success('文档已删除');
          loadDocs();
        } catch (err: any) {
          message.error(err.message || '删除失败');
        }
      },
    });
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    beforeUpload(file) {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        message.error(`不支持的文件格式（${ext}），请上传 ${ALLOWED_EXTENSIONS.join('、')} 文件`);
        return Upload.LIST_IGNORE;
      }
      if (file.size / 1024 / 1024 > MAX_FILE_SIZE_MB) {
        message.error(`文件大小超过 ${MAX_FILE_SIZE_MB}MB 限制`);
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    async customRequest({ file, onSuccess, onError }) {
      setUploading(true);
      try {
        await uploadDocument(file as File);
        message.success('文档上传成功，正在处理中...');
        onSuccess?.(null);
        loadDocs();
      } catch (err: any) {
        message.error(err.message || '上传失败');
        onError?.(err);
      } finally {
        setUploading(false);
      }
    },
  };

  const columns: TableColumnsType<DocumentItem> = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
      ellipsis: true,
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 200,
      render: (val: string) => new Date(val).toLocaleString('zh-CN'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const s = STATUS_MAP[status] ?? { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDelete(record)}
        >
          删除
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Title level={3}>知识库文档管理</Title>

      <Card style={{ marginBottom: 24 }}>
        <Dragger {...uploadProps} disabled={uploading}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {uploading ? '上传中，请稍候...' : '点击或拖拽文件到此区域上传'}
          </p>
          <p className="ant-upload-hint">
            支持 {ALLOWED_EXTENSIONS.join('、')} 格式，单个文件不超过 {MAX_FILE_SIZE_MB}MB
          </p>
        </Dragger>
      </Card>

      <Table<DocumentItem>
        rowKey="doc_id"
        columns={columns}
        dataSource={docs}
        loading={loading}
        pagination={{ pageSize: PAGE_SIZE, showTotal: total => `共 ${total} 条` }}
        locale={{ emptyText: '暂无文档，点击上方上传添加' }}
      />
    </div>
  );
}
